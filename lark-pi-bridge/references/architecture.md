# lark-pi-bridge 快速参考

## 架构总结

```
Lark 用户 → 发消息 → 飞书服务器 → WebSocket → lark-cli event consume (守护进程)
                                                           ↓ stdout
                                                    /tmp/lark-pi-bridge/events.jsonl
                                                           ↓ 轮询
                                                    pi agent (通过本 skill)
                                                           ↓
                                                    lark-cli im +messages-reply/send → 回复用户
```

## 实现原理

1. **lark-cli** 是一个 Node.js CLI 工具，封装了飞书 OpenAPI
2. 它用 `appId` + `appSecret`（Bot 身份）通过 WebSocket 订阅飞书事件
3. `lark-cli event consume im.message.receive_v1` 启动长连接，实时接收 IM 消息
4. 事件数据以 JSON Lines 格式输出到 stdout
5. 本 skill 管理这个 consumer 的生命周期，并提供轮询接口

## 数据流

| 组件 | 写什么 | 路径 |
|------|--------|------|
| lark-cli consumer stdout | 事件 JSON | `/tmp/lark-pi-bridge/events.jsonl` |
| lark-cli consumer stderr | 诊断日志 | `/tmp/lark-pi-bridge/daemon.log` |
| bridge.sh 输出 | 操作日志 | `/tmp/lark-pi-bridge/bridge.log` |
| replied.jsonl | 已回复记录 | `/tmp/lark-pi-bridge/replied.jsonl` |

## 事件 JSON 格式

```json
{
  "type": "im.message.receive_v1",
  "event_id": "60dde270859e5197fd258580f097810a",
  "message_id": "om_x100b6db8905fe0b0eeaab21a5076c5a",
  "create_time": "1781059049211",
  "chat_id": "oc_0ac7c769de219683d9cae2585a30deaa",
  "chat_type": "p2p",
  "message_type": "text",
  "sender_id": "ou_2a060e158be6079663cccadbcace1c16",
  "content": "消息内容（text/post/image 已解析为纯文本）"
}
```

## 配置信息

- **App ID**: `cli_aa93bec52e615e18`
- **Bot 身份**: ✅ 可用
- **User 身份**: ❌ 未配置（需要 `lark-cli auth login`）
- **默认模型**: deepseek-v4-flash (Sensenova)
- **已回复消息**: 16 条上下文在 replied.jsonl
