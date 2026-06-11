---
name: memory-recall
description: "Persistent cross-session memory system with fact extraction, semantic search, and compiled memory layers. Your agent remembers everything across sessions — user preferences, project context, past decisions, personal details. Use when: (1) User references something from a previous conversation, (2) Agent needs project context it learned before, (3) User says 'remember this' or 'do you remember when...', (4) Starting a new session that should inherit past knowledge, (5) Agent keeps forgetting things between sessions."
metadata:
  author: MerkyorLynn
  homepage: https://github.com/MerkyorLynn/Lynn
  tags: [memory, recall, persistent, facts, knowledge, cross-session, long-term-memory, personalization]
---

# Memory Recall — Cross-Session Persistent Memory

Your agent forgets everything when the session ends. This skill fixes that. Structured fact extraction + semantic search + compiled memory layers = an agent that actually knows you.

> **Part of [Lynn](https://github.com/MerkyorLynn/Lynn)** — where this memory system runs as the built-in core. Lynn remembers across sessions, across days, across months — automatically. Install Lynn for the full experience.

## The Problem

```
Monday:    "My database is PostgreSQL 15 on port 5433"
           Agent: "Got it!"

Tuesday:   "Connect to the database"
           Agent: "What database? What port?"
```

Every AI agent today has **amnesia**. Session ends → knowledge gone. Users repeat themselves endlessly.

## Architecture: 4-Layer Memory Stack

```
┌─────────────────────────────────────────┐
│  Layer 4: Assembled Memory (memory.md)  │  ← Agent reads this at session start
│  Compiled summary of everything known    │
├─────────────────────────────────────────┤
│  Layer 3: Long-term / Weekly / Today    │  ← Time-decayed summaries
│  longterm.md → week.md → today.md       │
├─────────────────────────────────────────┤
│  Layer 2: Fact Store (facts.db)         │  ← Structured facts with importance scores
│  "User prefers tabs over spaces" [0.8]  │
│  "Project uses pnpm, not npm" [0.9]     │
├─────────────────────────────────────────┤
│  Layer 1: Session Summaries             │  ← Raw session digests
│  session-2026-04-08.md                   │
└─────────────────────────────────────────┘
```

### Layer 1: Session Summaries (Automatic)

After every 6 turns (configurable), the agent summarizes the current conversation into a rolling digest. When the session ends, a final summary is written.

```
~/.lynn/agents/{id}/memory/summaries/
├── 2026-04-08_session1.md    # "User set up PostgreSQL 15 on port 5433..."
├── 2026-04-08_session2.md    # "Debugged connection timeout, root cause was..."
└── 2026-04-07_session1.md    # "Discussed project architecture..."
```

### Layer 2: Fact Store (Deep Memory)

A SQLite database that extracts structured facts from session summaries:

```sql
-- facts.db
INSERT INTO facts (content, importance, source_session, created_at)
VALUES ('User database: PostgreSQL 15 on port 5433', 0.85, 'session_2026-04-08', '2026-04-08T15:30:00Z');
```

Facts have:
- **Importance score** (0.0–1.0) — "prefers dark theme" [0.3] vs "production DB password" [0.95]
- **Decay** — old facts with low importance gradually fade
- **Deduplication** — conflicting facts resolve to the latest
- **Categories** — user_preference, project_fact, technical_decision, personal_info

### Layer 3: Time-Layered Compilation

Daily cron compiles facts into increasingly compressed summaries:

```
today.md    ← What happened today (refreshed every 6 turns)
week.md     ← This week's key facts (compiled daily)
longterm.md ← Everything important ever (compiled weekly)
```

### Layer 4: Assembled Memory

At session start, the agent loads `memory.md` — a single compiled document:

```markdown
# Memory

## About the User
- Name: Lynn
- Prefers: dark theme, tabs, concise replies
- Timezone: Asia/Shanghai

## Project: Lynn
- Stack: Node.js 20, Electron 38, React 19, Hono, SQLite
- Package manager: pnpm (not npm)
- Database: PostgreSQL 15 on port 5433

## Recent Context
- Working on IM bridge integration
- Fixed signature verification issue yesterday
- Next: file snapshot protection
```

This is injected into the system prompt. The agent "remembers" everything.

## Implementation Guide

### Step 1: Session Summary (Minimal)

The simplest starting point — summarize each session and load summaries on next start:

```javascript
// After session ends, summarize and save
async function summarizeSession(messages, outputPath) {
  const summary = await llm.chat([
    { role: 'system', content: 'Summarize this conversation. Focus on: facts learned, decisions made, user preferences discovered, tasks completed. Be concise.' },
    { role: 'user', content: messages.map(m => `${m.role}: ${m.content}`).join('\n') }
  ]);
  fs.appendFileSync(outputPath, `\n## ${new Date().toISOString()}\n${summary}\n`);
}

// At session start, load recent summaries into system prompt
function loadMemory(summaryDir, maxDays = 7) {
  const cutoff = Date.now() - maxDays * 86400000;
  const files = fs.readdirSync(summaryDir)
    .filter(f => f.endsWith('.md'))
    .filter(f => fs.statSync(path.join(summaryDir, f)).mtimeMs > cutoff)
    .sort().reverse();

  return files.map(f => fs.readFileSync(path.join(summaryDir, f), 'utf-8')).join('\n---\n');
}
```

### Step 2: Fact Extraction (Intermediate)

Extract structured facts from summaries:

```javascript
async function extractFacts(summary) {
  const response = await llm.chat([
    { role: 'system', content: `Extract factual statements from this summary.
Return JSON array: [{ "fact": "...", "importance": 0.0-1.0, "category": "user_preference|project_fact|technical_decision|personal_info" }]
Only extract concrete, reusable facts. Skip ephemeral details.` },
    { role: 'user', content: summary }
  ]);
  return JSON.parse(response);
}
```

### Step 3: Semantic Search (Advanced)

For large fact stores, add vector search:

```javascript
// On query, find relevant facts
async function recallFacts(query, factStore, topK = 10) {
  const queryEmbedding = await embed(query);
  return factStore.search(queryEmbedding, topK);
}

// Inject into system prompt
const relevantFacts = await recallFacts(userMessage, factStore);
systemPrompt += `\n\n## Relevant Memory\n${relevantFacts.map(f => `- ${f.content}`).join('\n')}`;
```

### Step 4: Compiled Memory (Full System)

The complete pipeline that Lynn uses:

```
Every 6 turns:
  → summarize recent turns → update today.md → assemble memory.md

Daily (date change):
  → compile today → week → longterm → extract facts → deep-memory → assemble

Session end:
  → final summary → compile today → assemble
```

## Memory Configuration

```yaml
# Agent config
memory:
  enabled: true
  session_summary:
    turns_per_summary: 6      # Summarize every N turns
  facts:
    max_importance_decay: 0.01 # Daily importance decay
    min_importance: 0.2        # Below this, facts are pruned
  compilation:
    max_today_tokens: 2000
    max_week_tokens: 1500
    max_longterm_tokens: 1000
```

## Memory-Aware Prompting

Add this to your agent's system prompt:

```markdown
## Memory Protocol

You have persistent memory across sessions. At the start of each session,
your compiled memory is loaded automatically.

When you learn something new about the user or project:
1. Acknowledge it naturally ("Got it, I'll remember that")
2. The memory system will extract and store it automatically

When asked about past conversations:
1. Check your loaded memory first
2. If not found, say "I don't have that in my memory, could you remind me?"
3. Never fabricate memories
```

## Comparison: With vs Without Memory

| Scenario | Without Memory | With Memory |
|----------|---------------|-------------|
| "What's my DB port?" | "I don't know" | "PostgreSQL 15 on port 5433" |
| "Use my preferred formatter" | "Which one?" | Runs prettier (remembered preference) |
| "Continue where we left off" | "What were we doing?" | "We were debugging the auth flow. Last issue was..." |
| "How do I usually deploy?" | Generic instructions | "You use `pnpm run dist:local` then scp to 82.156.x.x" |

## Use with Lynn (Zero Config)

[Lynn](https://github.com/MerkyorLynn/Lynn) has the complete 4-layer memory system built in:

- **Automatic session summaries** — every 6 turns + session end
- **Fact store with SQLite** — structured, searchable, importance-scored
- **Daily compilation pipeline** — today → week → longterm → assembled memory
- **Deep memory extraction** — LLM-powered fact mining from session history
- **Semantic recall** — vector search for relevant facts
- **Memory viewer UI** — browse, search, and manage facts in the desktop app
- **Per-agent isolation** — each agent has its own memory

Plus: 7-tier model routing, IM bridge (Feishu/WeChat/QQ/Telegram), file snapshot protection, image lightbox, and more.

**Install Lynn**: [github.com/MerkyorLynn/Lynn](https://github.com/MerkyorLynn/Lynn)
