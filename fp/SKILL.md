---
name: fp
description: "Finish with Proof — a portable execution protocol for coding agents. Use automatically for engineering work (build, change, diagnose, review, test, operate, or plan). Provides risk-matched routing (Small/Medium/Vague/Large), evidence-first diagnosis, on-demand profiles (live systems, multi-agent, provider compatibility, delegation, continuation), and verification gates. Explicit: \"FP:\" or \"$fp\". Do NOT use for casual conversation."
---

# FP — Finish with Proof

A portable execution protocol for coding agents. 77 lines. 3 core rules. On-demand profiles.

Activate automatically for engineering work; stay dormant for casual conversation.
`FP:` and `$fp` are optional explicit invocations.

## Three Core Rules

**1. Diagnose before patching.**
Gather evidence to identify root cause. Do not guess. Three non-narrowing probes → stop and switch to structural method (bisect, minimal reproduction, causal boundary trace). For known, low-risk changes a lightweight sanity check is enough.

**2. Verify before claiming done.**
Never say something is complete without observable evidence. Run the relevant tests. See them pass. "Implemented" is not "done." Unverified work stays unverified.

**3. Be concise and actionable.**
First line = result or current action. Last line = next concrete step or final verdict. No preamble, no filler. Compress explanation, never compress verification.

## Reuse Ladder

Before creating anything: does it need to exist? → already in codebase? → standard library? → native platform? → installed dependency? → one line? → only then add minimum new code.

## Routing

Classify the whole task before decomposing. Small is NOT the default.

| Route | Trigger | Output |
|-------|---------|--------|
| **Small** | ALL of: one file, ≤5 lines, cause known, no new interface/dependency/schema | Tiny Brief + verify |
| **Medium** | Multi-file, >5 lines, or added tests; no unresolved product decision | Execution Brief + evidence |
| **Vague** | Requirements or user-owned decisions underspecified | 2-3 Idea Cards → user picks → then Medium |
| **Large** | Architectural, multi-module, breaking, migration-heavy | Decompose into risk-reducing modules |

## On-Demand Profiles

Profiles load only when the condition matches — never by default. This was the #1 source of wasted tokens in previous versions.

| Condition | Reference |
|-----------|-----------|
| Third-party proxy, gateway, retry/loop/encoding suspect | `{baseDir}/references/provider-compatibility.md` |
| Multi-agent, sub-agent, parallel writers | `{baseDir}/references/multi-agent-review-protocol.md` |
| Remote/stateful target, OpenWrt, embedded, router | `{baseDir}/references/live-system.md` |
| Unknown failure; diagnosis without fix | `{baseDir}/references/debug-incident.md` |
| Cross-session continuation, resume after compaction | `{baseDir}/references/continuation.md` |
| Delegated execution with fresh agents | `{baseDir}/references/delegated-execution.md` |
| Vague/risky/large; requirements challenge needed | `{baseDir}/references/question-requirements.md` |

## Safety

- Redact all secrets (tokens, keys, passwords) from every output. Use `<REDACTED>`.
- Destructive or broad-scope mutations need explicit boundaries and confirmation.
- Live systems: preserve management path, create rollback, verify with real client path.

## Response Contract

- First-and-last-line gate: those two lines alone must reveal what just happened and what happens next.
- Errors: location, symptom, cause or `unknown`, fix/probe, verification. No theater.
- Options: 2-4 ranked choices, recommendation first, one-line tradeoffs.
- Estimates: concrete conditional numbers with named assumptions. Not vague.
- Multi-step: restate step/total every turn.

## Evidence Basis

This version is based on **1,416 real LLM API calls** across 3 models, 8 traits, and 3 testing methods. v-final (77 lines) is the champion on both reasoning models tested: GPT-5.6-Sol (3.57) and DeepSeek-v4-Pro (3.14).

Key findings:
- v-minimal (3 rules) wins on non-reasoning models — use for weaker models
- v-final (77 lines) wins on reasoning models — structured routing adds value
- Token consumption: -45% vs old 162-line version
- Tool calls: -57% fewer
- Template reads: -89% (1 vs 9, zero wasted)

Full report: [benchmarks/results/ARTICLE.md](https://github.com/MiaoY0uShan/FP/blob/main/benchmarks/results/ARTICLE.md)

## When NOT to Use

- Casual conversation, chitchat, non-engineering questions
- The agent already has a more specific skill handling the task
- Non-reasoning model (use `fp-minimal/SKILL.md` instead — just the 3 core rules)

## When to Use

- Any engineering task: build, change, diagnose, review, test, operate, plan
- Software, repositories, infrastructure, or agent tooling
- Explicit invocation: `FP: fix the bug` or `$fp diagnose the failure`