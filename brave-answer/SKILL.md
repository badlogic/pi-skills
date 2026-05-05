---
name: brave-answer
description: Use when the deliverable is a synthesized answer with verifiable citations — not a list of search results to sift through. Triggers include "what is X", "what's the latest Y", "summarize current state of Z", current-events Q&A, or any sourced/cited factual question. Use this instead of brave-search whenever the user wants the answer itself, not raw hits.
---

# Brave Answer

One-shot synthesized answer with numbered citations, via the Brave Answers API. Replaces a search-then-fetch-then-summarize loop with a single round-trip.

## When to Use

- "What's the latest stable release of X and what changed?"
- "Summarize the current status of Y."
- Any factual question where the user wants the answer + verifiable sources.
- When `brave-search` would force you to manually stitch sources together.

**Do not use** for:
- Browsing arbitrary pages (use `brave-search --content` or `content.js`).
- Code/library API references (use `context7`).
- Long-form research where you need raw search hits to triage yourself.

## Setup

Requires a Brave Search API account with the **Answers** plan. The plan includes $5 in free monthly credits (a credit card is required to subscribe; you won't be charged unless you exceed the free quota).

1. Create an account at https://api-dashboard.search.brave.com/register
2. Subscribe to the "Answers" plan
3. Create an API key for the subscription
4. Add to your shell profile (`~/.profile` or `~/.zprofile` for zsh):
   ```bash
   export BRAVE_ANSWER_API_KEY="your-api-key-here"
   ```
5. Install dependencies (run once):
   ```bash
   cd {baseDir}
   npm install
   ```

## Usage

```bash
{baseDir}/answer.js "what is the latest stable release of Bun?"
{baseDir}/answer.js "summarize the 2026 EU AI Act enforcement timeline"
{baseDir}/answer.js "current state of WebGPU support in Safari" --country GB
{baseDir}/answer.js "deep dive on RISC-V vector extension v1.0" --research
{baseDir}/answer.js "test query" --raw          # debug: keep <citation> tags
```

### Options

- `--research` — Multi-search deep mode. **Slow** (can take minutes) and significantly more expensive (a single research call ran ~$0.60 in smoke testing — well past the $5/mo free credit on a few uses). Returns a synthesized prose answer **without numbered citations** (the API does not return per-claim citations in research mode). Use only when a one-shot answer would be insufficient.
- `--country <code>` — Two-letter country code (default: `US`).
- `--language <code>` — Two-letter language code (default: `en`).
- `--raw` — Print raw API output without parsing citation tags. Debug only.

## Output Format

```
<synthesized answer prose, with [N] markers inline>

--- Sources ---
[1] https://example.com/page-one
    Snippet from the page that grounded claim 1...
[2] https://example.com/page-two
    Snippet from the page that grounded claim 2...
```

The `[N]` markers in the prose correspond to the numbered sources block. Always present unless `--raw` is set.

## Common Mistakes

- **Calling without the env var.** Script exits with a clear message — set `BRAVE_ANSWER_API_KEY`, not `BRAVE_API_KEY` (that one is for `brave-search`).
- **Using for arbitrary URL fetching.** This API only takes a question, not a URL. Use `brave-search`'s `content.js` for that.
- **Using `--research` casually.** It can run for minutes. Default mode is enough for almost every question.
- **Treating citations as gospel.** The API grounds the answer in real sources, but the synthesis can still misread them. For high-stakes claims, click through `[N]` and verify.
