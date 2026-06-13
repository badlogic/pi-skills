# lark-pi-bridge

> Lark(飞书) ↔ AI Agent 双向桥接。自动接收飞书消息、调用 AI 回复、支持工具调用。

[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-brightgreen)](https://agentskills.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能

- **自动回复守护进程** — 监听飞书 IM 消息，自动调用 AI 回复（支持上下文记忆）
- **交互模式** — AI Agent 主动轮询消息，使用完整工具箱回复（搜索、浏览器、文档等）
- **零配置 API** — 自动读取 pi 的 `models.json` 配置，无需硬编码密钥
- **开机自启** — 通过 launchd 在 macOS 登录时自动启动
- **高兼容性** — 支持 pi、Claude Code、Codex CLI、Amp、Droid 等 Agent Skills 标准平台

## 架构

```
Lark 用户 → WebSocket → lark-cli event consume
                              ↓
                       events.jsonl
                      ↙         ↘
          auto-daemon              AI Agent (pi/Claude/Codex)
        （自动快速回复）             （交互处理 + 工具调用）
              ↓                          ↓
      lark-cli +messages-send    lark-cli +messages-reply
```

### 两种模式

| 模式 | 描述 | 适合场景 |
|------|------|---------|
| **Auto-Daemon** | 守护进程自动监听并回复 | 日常聊天、快速问答、24h 在线 |
| **Interactive** | AI Agent 轮询消息后处理 | 复杂任务、需搜索/查文档/浏览器 |

两种模式可以并存：auto-daemon 处理日常对话，需要工具时由 AI Agent 接管。

## 快速开始

### 安装

```bash
# pi-coding-agent
git clone https://github.com/YOUR_USERNAME/lark-pi-bridge ~/.pi/agent/skills/lark-pi-bridge

# Claude Code
git clone https://github.com/YOUR_USERNAME/lark-pi-bridge ~/.claude/skills/lark-pi-bridge

# Codex CLI
git clone https://github.com/YOUR_USERNAME/lark-pi-bridge ~/.codex/skills/lark-pi-bridge
```

### 前置条件

- [lark-cli](https://www.npmjs.com/package/@larksuite/cli) — `npm install -g @larksuite/cli`
- 飞书 Bot 应用配置（appId + appSecret）
- Bot 身份已认证（`lark-cli auth status` 显示 bot ready）

### 启动

```bash
cd ~/.pi/agent/skills/lark-pi-bridge
scripts/bridge.sh start     # 启动全部组件
scripts/bridge.sh status    # 查看状态
scripts/bridge.sh stop      # 停止全部
```

### 开机自启 (macOS)

```bash
launchctl load ~/Library/LaunchAgents/com.johnwick.lark-pi-bridge.plist
```

## 数据文件

所有数据存储在 `~/.pi/agent/data/lark-bridge/`：

| 文件 | 说明 |
|------|------|
| `events.jsonl` | 飞书事件原始数据（由 lark-cli 写入） |
| `replied.jsonl` | 已回复记录（含问题+回答，用于上下文记忆） |
| `consumer.log` | lark-cli event consumer 日志 |
| `daemon.log` | auto-daemon 运行日志 |
| `manager.log` | bridge.sh 管理操作日志 |

## 配置

### AI 模型

auto-daemon 自动使用 pi 的默认 provider 和 model（当前：sensenova / deepseek-v4-flash）。如需修改，编辑 `~/.pi/agent/settings.json`：

```json
{
  "defaultProvider": "sensenova",
  "defaultModel": "deepseek-v4-flash"
}
```

### 身份

| 身份 | 状态 | 能力 |
|------|------|------|
| Bot | ✅ | 收发消息，显示为"Bot"名义 |
| User | 可选 | 收发消息，显示为个人身份 |

User 身份配置（可选）：

```bash
lark-cli auth login --scope "im:message" --no-wait --json
```

## 兼容性

| 平台 | 支持 | 备注 |
|------|------|------|
| pi-coding-agent | ✅ | 原生支持，SKILL.md 自动发现 |
| Claude Code | ✅ | 兼容 Agent Skills 标准 |
| Codex CLI | ✅ | 兼容 Agent Skills 标准 |
| Amp | ✅ | 递归发现 SKILL.md |
| Droid | ✅ | 兼容 Agent Skills 标准 |

## 开发计划

- [ ] 群聊消息支持（含 @匹配）
- [ ] 消息富文本回复（图片、卡片）
- [ ] 多会话上下文管理
- [ ] 仅 Linux systemd 自启配置
- [ ] Docker 部署支持

## License

MIT