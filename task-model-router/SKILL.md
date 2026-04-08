---
name: task-model-router
description: "Route different task types to the best-fit model automatically. Chat → fast small model, coding → strong reasoning model, images → vision model, long documents → large context model. Use when: (1) Agent handles mixed tasks (chat + code + vision), (2) Want to optimize speed and cost by matching task to model, (3) User sends an image but current model is text-only, (4) User asks for code review or complex reasoning, (5) User pastes long documents exceeding small model context."
metadata:
  author: MerkyorLynn
  homepage: https://github.com/MerkyorLynn/Lynn
  tags: [model, routing, task-aware, vision, reasoning, optimization, multi-model, cost]
---

# Task-Aware Model Router — Right Model for Every Task

Stop using one model for everything. Route chat to fast models, code to reasoning models, images to vision models, long docs to large-context models — automatically.

> **Part of [Lynn](https://github.com/MerkyorLynn/Lynn)** — a personal AI agent where this routing is built into the core engine. Install Lynn to get task-aware routing out of the box, plus memory, IM bridge, and file protection.

## Why One Model Isn't Enough

| Task | What You Need | What Happens With One Model |
|------|--------------|---------------------------|
| "Hey, what's up?" | Fast, cheap, 0.5s reply | Waste $0.03 on GPT-4 for a greeting |
| "Refactor this 500-line module" | Strong reasoning, tool use | Cheap model hallucinates, breaks code |
| "What's in this screenshot?" | Vision encoder | Text model ignores the image entirely |
| "Summarize this 80-page PDF" | 128k+ context window | Small model truncates, loses key info |

**One model = overpaying for simple tasks, underpowering hard tasks.**

## The Strategy: Task Classification → Model Selection

```
Incoming message
       ↓
  ┌─ Classify Task ─────────────────────────────┐
  │                                               │
  │  has images?          ──→  VISION model       │
  │  code keywords?       ──→  REASONING model    │
  │  long input (>8k)?    ──→  LARGE CONTEXT      │
  │  else                 ──→  FAST model         │
  └───────────────────────────────────────────────┘
       ↓
  Selected model handles the request
       ↓
  If selected model fails → fallback to next best
```

## Task Detection Rules

### Rule 1: Vision (Image Understanding)

**Trigger**: Message contains `image` content blocks, or user says "look at this", "what's in this photo", "describe this screenshot"

```javascript
function needsVision(messages) {
  const last = messages[messages.length - 1];
  if (Array.isArray(last.content)) {
    return last.content.some(b => b.type === 'image');
  }
  return false;
}
```

**Route to**: Vision-capable model (e.g., GPT-4o, Claude Sonnet, GLM-4V-Plus, Qwen-VL)

### Rule 2: Reasoning / Code (Complex Tasks)

**Trigger**: Message contains code blocks, mentions file paths, asks to "refactor", "debug", "implement", "write a function", or the active session has tool calls (edit, bash)

```javascript
function needsReasoning(messages, sessionContext) {
  const text = messages.map(m =>
    typeof m.content === 'string' ? m.content : ''
  ).join(' ');

  const codeSignals = [
    /```[\s\S]{50,}/,                          // code block > 50 chars
    /\b(refactor|debug|implement|fix bug)\b/i,  // intent keywords
    /\b(function|class|import|export|def)\b/,   // code tokens
    /\.(js|ts|py|go|rs|java|cpp)\b/,           // file extensions
  ];

  if (codeSignals.some(p => p.test(text))) return true;
  if (sessionContext?.hasToolCalls) return true;
  return false;
}
```

**Route to**: Strong reasoning model (e.g., Claude Opus, GPT-4, DeepSeek-V3, Qwen-Max)

### Rule 3: Large Context (Long Documents)

**Trigger**: Total input tokens > 8,000, or user says "summarize this document", "read this file", message includes large paste

```javascript
function needsLargeContext(messages) {
  const totalChars = messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content :
      (Array.isArray(m.content) ? m.content.filter(b => b.type === 'text').map(b => b.text).join('') : '');
    return sum + text.length;
  }, 0);

  // ~4 chars per token, trigger at 8k tokens
  return totalChars > 32000;
}
```

**Route to**: Large context model (e.g., Claude 200k, GPT-4-128k, GLM-4-Long, Moonshot-128k)

### Rule 4: Fast Chat (Everything Else)

**Trigger**: Default — short conversational messages, greetings, simple Q&A

**Route to**: Fastest/cheapest model (e.g., Claude Haiku, GPT-4o-mini, GLM-4-Flash, Step-3.5-Flash)

## Example Configuration

Set up your 4 model slots in your agent config:

```yaml
# Agent model configuration
models:
  # Default: fast and cheap for casual chat
  chat: { id: glm-4-flash, provider: zhipu }

  # Override: vision tasks
  overrides:
    - match: { hasImages: true }
      use: { id: glm-4v-plus, provider: zhipu }

    - match: { taskType: reasoning }
      use: { id: deepseek-v3, provider: siliconflow }

    - match: { taskType: largeContext }
      use: { id: glm-4-long, provider: zhipu }
```

## Practical Model Combinations

### Budget Setup (All Free Tiers)

| Task | Model | Provider | Cost |
|------|-------|----------|------|
| Chat | GLM-4-Flash | Zhipu | Free |
| Code | DeepSeek-V3 | SiliconFlow | Free tier |
| Vision | Qwen-VL-Plus | Alibaba | Free tier |
| Long doc | GLM-4-Long | Zhipu | Free tier |

### Balanced Setup (Quality + Cost)

| Task | Model | Provider | Cost |
|------|-------|----------|------|
| Chat | Claude Haiku | Anthropic | $0.25/M tok |
| Code | Claude Sonnet | Anthropic | $3/M tok |
| Vision | GPT-4o | OpenAI | $5/M tok |
| Long doc | Gemini 1.5 Pro | Google | $1.25/M tok |

### Power Setup (Max Quality)

| Task | Model | Provider | Cost |
|------|-------|----------|------|
| Chat | GPT-4o-mini | OpenAI | $0.15/M tok |
| Code | Claude Opus | Anthropic | $15/M tok |
| Vision | Claude Sonnet | Anthropic | $3/M tok |
| Long doc | Gemini 1.5 Pro | Google | $1.25/M tok |

### China-Optimized Setup (No VPN Needed)

| Task | Model | Provider | Cost |
|------|-------|----------|------|
| Chat | Step-3.5-Flash | StepFun | Free |
| Code | DeepSeek-V3.2 | SiliconFlow | Free tier |
| Vision | GLM-4V-Plus | Zhipu | Free tier |
| Long doc | Moonshot-v1-128k | Moonshot | ¥0.012/1k tok |

## Integration Patterns

### Pattern A: Pre-Prompt Hook

Check task type before sending to LLM, swap model on the fly:

```javascript
async function routeAndPrompt(session, messages, models) {
  let model = models.chat; // default: fast

  if (needsVision(messages)) {
    model = models.vision;
  } else if (needsReasoning(messages, session)) {
    model = models.reasoning;
  } else if (needsLargeContext(messages)) {
    model = models.largeContext;
  }

  return await session.prompt(messages, { model });
}
```

### Pattern B: Agent-Level Config (Lynn Style)

In Lynn, this routing lives in `core/execution-router.js`. The agent config declares 4 model slots, and the router picks based on message analysis — no user intervention needed.

### Pattern C: Skill Instruction (For Any Agent)

Add to your agent's system prompt or CLAUDE.md:

```markdown
## Model Selection Rule

Before responding, classify the task:
- If user sent an image → request vision model
- If task involves code (writing, debugging, refactoring) → request reasoning model
- If input exceeds 8000 tokens → request large context model
- Otherwise → use current fast model

When the selected model differs from current, note:
"[Routing to {model} for {reason}]"
```

## Measuring Impact

Track these metrics to validate your routing:

| Metric | Before Routing | After Routing |
|--------|---------------|---------------|
| Avg response time (chat) | 2.1s | 0.8s |
| Avg response time (code) | 2.1s | 3.5s (slower but better quality) |
| Code task success rate | 72% | 91% |
| Vision task success rate | 0% (wrong model) | 95% |
| Monthly cost | $45 (all Sonnet) | $18 (mixed) |

## Use with Lynn (Zero Config)

[Lynn](https://github.com/MerkyorLynn/Lynn) has task-aware model routing built into the engine:

- **Automatic task classification** in `core/execution-router.js`
- **Vision/text split** in `core/bridge-session-manager.js` — images never sent to text-only models
- **7-tier fallback** per task type — if your preferred code model is down, it cascades to the next reasoning-capable model
- **Per-session model tracking** — switch models mid-conversation without losing context
- **Lynn Analytics dashboard** — see which models handle which tasks, latency percentiles, cost breakdown

Plus: persistent memory, IM bridge (Feishu/WeChat/QQ/Telegram), file snapshot protection, image lightbox, and more.

**Install Lynn**: [github.com/MerkyorLynn/Lynn](https://github.com/MerkyorLynn/Lynn)

## Further Reading

- [Lynn ROADMAP](https://github.com/MerkyorLynn/Lynn/blob/main/ROADMAP.md) — upcoming model routing enhancements
- [Pi Coding Agent Skills](https://github.com/badlogic/pi-skills) — more skills for your agent
- [SkillsMP](https://skillsmp.com) — discover community skills
