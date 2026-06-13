#!/bin/bash
# =============================================
# lark-pi-bridge 自动回复守护进程 v4
# 从 pi 的 models.json 读取 API 配置，无硬编码密钥
# =============================================

set -e

# ---------- 路径 ----------
DATA_DIR="$HOME/.pi/agent/data/lark-bridge"
EVENT_LOG="$DATA_DIR/events.jsonl"
REPLIED_FILE="$DATA_DIR/replied.jsonl"
DAEMON_LOG="$DATA_DIR/daemon.log"
PID_FILE="$DATA_DIR/daemon.pid"

mkdir -p "$DATA_DIR"

echo "$$" > "$PID_FILE"
echo "[daemon v4] $(date '+%Y-%m-%d %H:%M:%S') START" >> "$DAEMON_LOG"

# ---------- 从 pi 配置读取默认 API ----------
read_pi_config() {
    local cfg
    cfg=$(python3 -c "
import json, os
path = os.path.expanduser('~/.pi/agent/models.json')
with open(path) as f:
    d = json.load(f)

# 从 settings.json 读 defaultProvider/defaultModel
settings_path = os.path.expanduser('~/.pi/agent/settings.json')
default_provider = 'sensenova'
default_model = 'deepseek-v4-flash'
try:
    with open(settings_path) as sf:
        s = json.load(sf)
        default_provider = s.get('defaultProvider', default_provider)
        default_model = s.get('defaultModel', default_model)
except: pass

# 查找 provider 配置
providers = d.get('providers', {})
p = providers.get(default_provider, {})
print(json.dumps({
    'provider': default_provider,
    'model': default_model,
    'baseUrl': p.get('baseUrl', ''),
    'apiKey': p.get('apiKey', ''),
    'api': p.get('api', 'openai-completions')
}))
" 2>/dev/null) || echo '{"provider":"sensenova","model":"deepseek-v4-flash","baseUrl":"https://token.sensenova.cn/v1","apiKey":"","api":"openai-completions"}'
    echo "$cfg"
}

PI_CONFIG=$(read_pi_config)
API_KEY=$(echo "$PI_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])" 2>/dev/null)
API_URL=$(echo "$PI_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); u=d['baseUrl']; print(f'{u}/chat/completions' if u else '')" 2>/dev/null)
MODEL=$(echo "$PI_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['model'])" 2>/dev/null)

[ -z "$API_KEY" ] && { echo "[daemon v4] ERROR: No API key found in pi config" >> "$DAEMON_LOG"; exit 1; }
[ -z "$API_URL" ] && { echo "[daemon v4] ERROR: No API URL found in pi config" >> "$DAEMON_LOG"; exit 1; }

echo "[daemon v4] Using: $MODEL @ $API_URL" >> "$DAEMON_LOG"

# ---------- 系统提示词 ----------
SYSTEM_PROMPT="你是 pi agent，一个智能 AI 助手，运行在 john 的电脑上，通过飞书 Bot 与 john 对话。

风格：自然、亲切，像朋友聊天。用中文。简洁但不敷衍。知道自己是谁（pi agent），也知道在和谁对话（john）。

当前是飞书私聊。"

# ---------- 函数 ----------
call_ai() {
    local content="$1"
    local context="$2"  # 可选的上下文JSON（最近5条）
    
    local payload
    payload=$(python3 -c "
import json, sys
content = sys.argv[1]
ctx_raw = sys.argv[2]
model = sys.argv[3]

system = '''$SYSTEM_PROMPT'''

messages = [{'role': 'system', 'content': system}]

# 加入上下文记忆
if ctx_raw:
    try:
        ctx = json.loads(ctx_raw)
        for item in ctx[-5:]:  # 最多5条
            q = item.get('question', '')
            r = item.get('reply', '')
            if q:
                messages.append({'role': 'user', 'content': q})
            if r and r != '__pending__':
                messages.append({'role': 'assistant', 'content': r})
    except: pass

messages.append({'role': 'user', 'content': content})

obj = {
    'model': model,
    'messages': messages,
    'max_tokens': 2048,
    'temperature': 0.7
}
json.dump(obj, sys.stdout, ensure_ascii=False)
" "$content" "${2:-}" "$MODEL" 2>/dev/null)
    
    [ -z "$payload" ] && { echo "ERROR: payload gen failed"; return 1; }
    
    local result
    result=$(curl -s -X POST "$API_URL" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null)
    
    echo "$result" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'choices' in d and d['choices']:
        print(d['choices'][0]['message']['content'].strip())
    else:
        print('ERROR: ' + d.get('error', {}).get('message', str(d)))
except Exception as e:
    print('ERROR: ' + str(e))
" 2>/dev/null
}

send_reply() {
    lark-cli im +messages-send --chat-id "$1" --text "$2" --as bot >/dev/null 2>&1
}

load_context() {
    python3 -c "
import json
try:
    with open('$REPLIED_FILE') as f:
        lines = [l for l in f if l.strip()]
    items = []
    for l in lines[-20:]:
        d = json.loads(l)
        if d.get('reply') and d['reply'] != '__pending__':
            items.append(d)
    print(json.dumps(items[-5:], ensure_ascii=False))
except:
    print('[]')
" 2>/dev/null
}

record_reply() {
    local mid="$1" question="$2" reply="$3"
    local ts
    ts=$(date +%s)
    # 用临时文件避免 shell 注入
    python3 -c "
import json, sys, time
mid = sys.argv[1]
question = sys.argv[2]
reply = sys.argv[3]
ts = int(sys.argv[4])
record = json.dumps({
    'message_id': mid,
    'question': question,
    'reply': reply,
    'time': ts
}, ensure_ascii=False)
with open('$REPLIED_FILE', 'a') as f:
    f.write(record + '\n')
" "$mid" "$question" "$reply" "$ts" 2>/dev/null
}

process_event() {
    local line="$1"
    [ -z "$line" ] && return
    
    local mid cid ctp mtp cnt
    mid=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('message_id') or d.get('id',''))" 2>/dev/null)
    cid=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('chat_id',''))" 2>/dev/null)
    ctp=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('chat_type',''))" 2>/dev/null)
    mtp=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('message_type',''))" 2>/dev/null)
    cnt=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('content',''))" 2>/dev/null)
    
    [ -z "$mid" ] && return
    [ "$ctp" != "p2p" ] && return
    [ "$mtp" != "text" ] && return
    
    # 去重
    if grep -q "$mid" "$REPLIED_FILE" 2>/dev/null; then
        return
    fi
    
    echo "[$(date +%H:%M:%S)] 📩 $cnt" >> "$DAEMON_LOG"
    
    # 加载上下文
    local context
    context=$(load_context)
    
    # 调用 AI
    local reply
    reply=$(call_ai "$cnt" "$context")
    
    if [ -n "$reply" ] && [[ "$reply" != ERROR* ]]; then
        echo "[$(date +%H:%M:%S)] 💬 ${reply:0:60}..." >> "$DAEMON_LOG"
        send_reply "$cid" "$reply"
    else
        echo "[$(date +%H:%M:%S)] ⚠️ $reply" >> "$DAEMON_LOG"
        reply="收到，让我想想..."
        send_reply "$cid" "$reply"
    fi
    
    record_reply "$mid" "$cnt" "$reply"
}

# ---------- 主循环 ----------
touch "$EVENT_LOG"
touch "$REPLIED_FILE"
echo "[daemon v4] READY: listening on $EVENT_LOG" >> "$DAEMON_LOG"

# 用 hash 追踪文件位置
last_size=0

while true; do
    if [ -f "$EVENT_LOG" ]; then
        current_size=$(stat -f%z "$EVENT_LOG" 2>/dev/null)
        
        if [ "$current_size" -gt "$last_size" ]; then
            # 读取新内容
            dd bs=1 skip="$last_size" count=$((current_size - last_size)) if="$EVENT_LOG" 2>/dev/null | \
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                process_event "$line"
            done
            last_size=$current_size
        fi
    fi
    sleep 2
done