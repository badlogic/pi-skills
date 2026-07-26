# Multi-Agent Review Protocol

Load when multiple agents or sub-agents are writing in parallel.

## Rules

1. **Parent is integrator**: Default writer, final verifier
2. **Subagent envelope**: Goal, scope, invariants, forbidden actions, output format
3. **Leaf restrictions**: Cannot delegate, deploy, promote memory, message externally, use credentials, mutate live state
4. **One writer per shared file set**: Parallelize only independent investigation
5. **Parent reruns critical checks**: Subagent claims are not evidence

## Handoff Format

```
Goal: [one sentence]
Scope: [files/dirs, read vs write]
Invariants: [must not change]
Forbidden: [actions not allowed]
Output: [expected deliverable]
Deadline: [max iterations/time]
```