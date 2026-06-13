#!/bin/bash
# lark-pi-bridge 统一管理脚本
# 管理：event consumer + 自动回复守护进程

DATA_DIR="$HOME/.pi/agent/data/lark-bridge"
EVENT_FILE="$DATA_DIR/events.jsonl"
REPLIED_FILE="$DATA_DIR/replied.jsonl"
CONSUMER_PID="$DATA_DIR/consumer.pid"
DAEMON_PID="$DATA_DIR/daemon.pid"
CONSUMER_LOG="$DATA_DIR/consumer.log"
DAEMON_LOG="$DATA_DIR/daemon.log"
MANAGER_LOG="$DATA_DIR/manager.log"

mkdir -p "$DATA_DIR"

log() {
    echo "[manager] $(date '+%H:%M:%S') $*" | tee -a "$MANAGER_LOG"
}

# ============ 启动全部 ============
start() {
    start_consumer
    start_daemon
    log "✅ lark-pi-bridge fully started"
}

# ============ 启动事件消费 ============
start_consumer() {
    if [ -f "$CONSUMER_PID" ] && kill -0 "$(cat "$CONSUMER_PID")" 2>/dev/null; then
        log "consumer already running (pid=$(cat "$CONSUMER_PID"))"
        return 0
    fi

    # 清理旧 consumer
    for pid in $(pgrep -f "lark-cli event consume im.message.receive_v1" 2>/dev/null); do
        kill "$pid" 2>/dev/null
    done

    # 启动 consumer
    # stdout → events.jsonl（事件数据）
    # stderr → consumer.log（诊断）
    nohup bash -c "
        exec < <(tail -f /dev/null)
        lark-cli event consume im.message.receive_v1 --as bot --timeout 86400s
    " 1>>"$EVENT_FILE" 2>>"$CONSUMER_LOG" &
    local pid=$!
    echo "$pid" > "$CONSUMER_PID"

    # 等待 ready
    local waited=0
    while [ $waited -lt 15 ]; do
        if grep -q "ready event_key" "$CONSUMER_LOG" 2>/dev/null; then
            log "consumer started (pid=$pid) ✅"
            return 0
        fi
        sleep 1
        ((waited++))
    done
    log "consumer started (pid=$pid, waiting for WS connection...)"
}

# ============ 启动自动回复守护进程 ============
start_daemon() {
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        log "auto-daemon already running (pid=$(cat "$DAEMON_PID"))"
        return 0
    fi

    # 检查 auto-daemon 脚本是否存在
    local daemon_script="$HOME/.pi/agent/skills/lark-pi-bridge/scripts/auto-daemon.sh"
    if [ ! -f "$daemon_script" ]; then
        log "auto-daemon script not found at $daemon_script"
        return 1
    fi

    nohup bash "$daemon_script" > /dev/null 2>&1 &
    local pid=$!
    echo "$pid" > "$DAEMON_PID"
    sleep 2
    
    if kill -0 "$pid" 2>/dev/null; then
        log "auto-daemon started (pid=$pid) ✅"
        return 0
    else
        log "auto-daemon FAILED to start"
        return 1
    fi
}

# ============ 停止全部 ============
stop() {
    local count=0

    # 停 auto-daemon
    if [ -f "$DAEMON_PID" ]; then
        local dpid
        dpid=$(cat "$DAEMON_PID")
        kill "$dpid" 2>/dev/null && ((count++))
        rm -f "$DAEMON_PID"
    fi
    # 也 kill 所有 auto-daemon 进程
    for pid in $(pgrep -f "auto-daemon.sh" 2>/dev/null); do
        kill "$pid" 2>/dev/null && ((count++))
    done

    # 停 consumer
    if [ -f "$CONSUMER_PID" ]; then
        local cpid
        cpid=$(cat "$CONSUMER_PID")
        kill "$cpid" 2>/dev/null && ((count++))
        rm -f "$CONSUMER_PID"
    fi
    for pid in $(pgrep -f "lark-cli event consume im.message.receive_v1" 2>/dev/null); do
        kill "$pid" 2>/dev/null && ((count++))
    done

    if [ "$count" -gt 0 ]; then
        log "stopped $count process(es)"
        sleep 2
    else
        log "nothing running"
    fi

    # 停 bus daemon
    local bus_pid
    bus_pid=$(lark-cli event status --json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for app in d.get('apps', []):
    if app.get('active_consumers', 0) == 0:
        print(app.get('pid', ''))
" 2>/dev/null)
    if [ -n "$bus_pid" ]; then
        kill "$bus_pid" 2>/dev/null
        log "stopped bus daemon"
    fi
}

# ============ 状态 ============
status() {
    local json
    json=$(lark-cli event status --json 2>/dev/null)

    local running=false
    local received=0
    local consumer_pid=""

    if echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for app in d.get('apps', []):
    if app.get('active_consumers', 0) > 0:
        sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
        running=true
        consumer_pid=$(echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for app in d.get('apps', []):
    for c in app.get('consumers', []):
        print(f'{c.get(\"pid\",\"?\")}|{c.get(\"received\",0)}')
" 2>/dev/null)
        consumer_pid=$(echo "$consumer_pid" | cut -d'|' -f1)
        received=$(echo "$consumer_pid" | cut -d'|' -f2)
    fi

    local daemon_alive=false
    [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null && daemon_alive=true

    local event_count=0
    [ -f "$EVENT_FILE" ] && event_count=$(wc -l < "$EVENT_FILE")
    local replied_count=0
    [ -f "$REPLIED_FILE" ] && replied_count=$(wc -l < "$REPLIED_FILE")

    echo ""
    echo "📡 ╔═══════════════════════════╗"
    echo "📡 ║  Lark ↔ pi Bridge Status  ║"
    echo "📡 ╚═══════════════════════════╝"
    echo ""
    if $running; then
        echo "  Event Consumer: ✅ 运行中 (pid=$consumer_pid)"
        echo "  收到事件      : $received"
    else
        echo "  Event Consumer: ❌ 未运行"
    fi
    if $daemon_alive; then
        echo "  Auto-Responder : ✅ 运行中 (pid=$(cat "$DAEMON_PID"))"
    else
        echo "  Auto-Responder : ❌ 未运行"
    fi
    echo ""
    echo "  数据文件 (${DATA_DIR}):"
    echo "  ├─ events.jsonl : $event_count 条事件"
    echo "  └─ replied.jsonl: $replied_count 条回复"
    echo ""
    echo "  命令: /lark:start  /  /lark:stop  /  /lark:status  /  /lark:log"
}

# ============ 轮询（供 pi 交互模式） ============
poll() {
    local event_file="$EVENT_FILE"
    local replied_file="$REPLIED_FILE"
    [ ! -f "$event_file" ] && touch "$event_file"
    [ ! -f "$replied_file" ] && touch "$replied_file"

    local replied_ids
    replied_ids=$(python3 -c "
ids = set()
try:
    with open('$replied_file') as f:
        for line in f:
            line = line.strip()
            if line:
                import json
                d = json.loads(line)
                ids.add(d.get('message_id', ''))
except: pass
print('\n'.join(sorted(ids)))
" 2>/dev/null)

    local new_events
    new_events=$(python3 -c "
import json, sys
replied = set('''$replied_ids'''.split('\n'))
new = []
try:
    with open('$event_file') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            d = json.loads(line)
            mid = d.get('message_id') or d.get('id', '')
            if mid in replied: continue
            if d.get('chat_type') == 'p2p' and d.get('message_type') == 'text':
                new.append(d)
except Exception as e:
    sys.stderr.write(str(e))

if new:
    for d in new[-5:]:
        print(json.dumps(d, ensure_ascii=False))
" 2>/dev/null)

    if [ -z "$new_events" ]; then
        echo "NO_NEW_MESSAGES"
        return 0
    fi

    echo "$new_events"

    # 标记为 pending
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local mid
        mid=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('message_id',''))" 2>/dev/null)
        if [ -n "$mid" ]; then
            python3 -c "
import json, time
d = json.loads('''$line''')
record = {
    'message_id': d.get('message_id') or d.get('id', ''),
    'chat_id': d.get('chat_id', ''),
    'sender_id': d.get('sender_id', ''),
    'question': d.get('content', ''),
    'reply': '__pending__',
    'time': time.time()
}
with open('$replied_file', 'a') as f:
    f.write(json.dumps(record, ensure_ascii=False) + '\n')
" 2>/dev/null
        fi
    done <<< "$new_events"
}

# ============ 查看日志 ============
log_view() {
    echo "=== Consumer Log ==="
    tail -20 "$CONSUMER_LOG" 2>/dev/null || echo "(no consumer log)"
    echo ""
    echo "=== Auto-Daemon Log ==="
    tail -20 "$DAEMON_LOG" 2>/dev/null || echo "(no daemon log)"
    echo ""
    echo "=== Manager Log ==="
    tail -10 "$MANAGER_LOG" 2>/dev/null || echo "(no manager log)"
}

# ============ 查看最近对话 ============
chat_log() {
    python3 -c "
import json
try:
    with open('$REPLIED_FILE') as f:
        lines = [l for l in f if l.strip()]
    for l in lines[-10:]:
        d = json.loads(l)
        q = d.get('question', '')[:60]
        r = d.get('reply', '')[:80]
        t = d.get('time', '')
        print(f'[{t}]')
        print(f'  Q: {q}')
        print(f'  A: {r}')
        print()
except Exception as e:
    print(f'No chat history: {e}')
" 2>/dev/null
}

# ============ 清理 ============
clean() {
    local total
    [ -f "$EVENT_FILE" ] && total=$(wc -l < "$EVENT_FILE")
    if [ "$total" -gt 500 ]; then
        tail -100 "$EVENT_FILE" > "${EVENT_FILE}.tmp"
        mv "${EVENT_FILE}.tmp" "$EVENT_FILE"
        log "cleaned events (kept 100, removed $((total-100)))"
    fi
}

# ============ 主入口 ============
case "${1:-help}" in
    start)            start ;;
    stop)             stop ;;
    restart)          stop; sleep 2; start ;;
    status)           status ;;
    poll)             poll ;;
    log)              log_view ;;
    chat)             chat_log ;;
    clean)            clean ;;
    start-consumer)   start_consumer ;;
    start-daemon)     start_daemon ;;
    help|--help|-h)
        echo "Lark ↔ pi Bridge Manager v4"
        echo ""
        echo "用法: scripts/bridge.sh <命令>"
        echo ""
        echo "管理命令:"
        echo "  start             启动全部（consumer + auto-daemon）"
        echo "  stop              停止全部"
        echo "  restart           重启全部"
        echo "  status            查看状态"
        echo ""
        echo "调试命令:"
        echo "  log               查看所有日志"
        echo "  chat              查看最近对话"
        echo "  poll              轮询新消息（供 pi 使用）"
        echo "  clean             清理事件文件"
        echo ""
        echo "组件命令:"
        echo "  start-consumer    只启动 event consumer"
        echo "  start-daemon      只启动 auto-daemon"
        ;;
    *)
        log "unknown: $1"
        exit 1
        ;;
esac