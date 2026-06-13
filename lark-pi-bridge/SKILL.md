---
name: lark-pi-bridge
description: "Lark(飞书) ↔ AI Agent 双向桥接。自动接收飞书消息并回复，支持 auto-daemon 快速回复 + 交互模式工具调用。兼容 pi、Claude Code、Codex CLI、Amp、Droid。"
metadata:
  requires:
    bins: ["lark-cli"]
  cliHelp: "lark-cli --help"
---

# Lark ↔ pi Bridge

> **前置条件**: 确保 `lark-cli` 已安装（`npm install -g @larksuite/cli`），bot 身份可用（`lark-cli auth status`）

## 安装

### Pi

```bash
git clone <repo-url> ~/.pi/agent/skills/lark-pi-bridge
```

Pi 自动发现 skill，启动后会显示 `/lark:start`、`/lark:status` 等命令。

### Claude Code / Codex CLI / Amp / Droid

```bash
# Claude Code
git clone <repo-url> ~/.claude/skills/lark-pi-bridge

# Codex CLI
git clone <repo-url> ~/.codex/skills/lark-pi-bridge

# Amp
git clone <repo-url> ~/.config/amp/tools/lark-pi-bridge
```

## 架构

```
Lark 用户 → WebSocket → event consume (守护进程)
                              ↓ stdout
                      events.jsonl
                       ↙         ↘
           auto-daemon.sh           AI Agent（你）
          (自动回复，快速聊天)       (交互处理，工具调用)
                ↓                         ↓
       lark-cli +messages-send    lark-cli +messages-reply/send
```

**数据目录**: `~/.pi/agent/data/lark-bridge/`

## 两种工作模式

### 模式 A：自动回复模式（auto-daemon，独立运行）

守护进程自动监听飞书消息并回复。**每次登录自动启动**，Agent 不在也在线。

适合：日常聊天、快速问答。使用 Agent 的默认 AI 模型（当前 deepseek-v4-flash）。

### 模式 B：交互模式（Agent 在线处理）

Agent 主动轮询新消息，用完整工具箱回复（可调用搜索、浏览器、Lark 文档等）。

适合：复杂任务、需要工具调用、需要访问 Lark 资源。

**两种模式可以共存**：auto-daemon 自动回复简单消息；Agent 通过 `/lark:check` 接管需要工具的场景。

## 快速开始

| 命令 | 用途 |
|------|------|
| `/lark:start` | 启动全部（consumer + auto-daemon） |
| `/lark:stop` | 停止全部 |
| `/lark:status` | 查看运行状态 |
| `/lark:check` | 轮询未处理的新消息（交互模式） |
| `/lark:chat` | 查看最近对话历史 |
| `/lark:log` | 查看守护进程日志 |

```bash
# 查看状态
scripts/bridge.sh status

# 启动全部
scripts/bridge.sh start

# 检查新消息（交互模式）
scripts/bridge.sh poll
```

## 自动回复守护进程

### 特性

- **从 Agent 配置读 API**: 自动使用 pi 的 `defaultProvider/defaultModel`
- **上下文记忆**: 自动加载最近 5 条对话历史
- **去重**: 不会重复回复同一消息
- **稳定**: 2 秒轮询，低资源消耗

### 数据

```
~/.pi/agent/data/lark-bridge/
├── events.jsonl      ← 飞书事件原始数据
├── replied.jsonl     ← 已回复记录（含 question + reply）
├── consumer.log      ← event consumer 日志
├── daemon.log        ← auto-daemon 日志
└── manager.log       ← bridge.sh 操作日志
```

## 交互模式消息处理

Agent 检查到新消息时应：

1. **展示消息**: "📩 Lark 消息: {内容}"
2. **理解并思考**: 需要工具就调用工具
3. **回复**: `lark-cli im +messages-send --chat-id <id> --text "回复" --as bot`
4. **记录**: 写入 replied.jsonl

回复风格：自然亲切，像朋友聊天。用中文。

## 响应规则

- 当用户提到 Lark 消息时 → 执行 `scripts/bridge.sh poll`
- 每次对话开始时 → 检查 `scripts/bridge.sh status` 确保桥接在线
- 发现新消息 → 展示给用户，等待指示如何回复
- 对于需要工具的问题 → 用 Agent 的全部能力处理

## 开机自启 (macOS)

```bash
launchctl load ~/Library/LaunchAgents/com.johnwick.lark-pi-bridge.plist
```

## 身份说明

- **Bot 身份** ✅: `--as bot` 收发消息，回复显示为 Bot 名义
- **User 身份** ❌: 可选配置，显示为个人身份

## 故障排查

```bash
# 检查 WebSocket 连接
tail -3 ~/.pi/agent/data/lark-bridge/consumer.log

# 检查 auto-daemon 日志
tail -20 ~/.pi/agent/data/lark-bridge/daemon.log

# 重启
scripts/bridge.sh restart
```