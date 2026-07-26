# Delegated Execution Profile

Load when delegating work to fresh agents or sub-processes.

## Protocol

1. **Bounded envelope**: Goal, scope, invariants, forbidden actions, output format
2. **Leaf constraints**: Cannot delegate further, deploy, use credentials, message externally, mutate live state
3. **Parent verification**: All subagent output is treated as claim, not evidence
4. **Idempotency key**: Each delegation has a unique key for deduplication
5. **Terminal cleanup**: Subagent resources are released on completion or timeout

## Delegation Template

```
Goal: [one sentence outcome]
Scope: [exact files/dirs, read/write boundaries]
Invariants: [must not change or break]
Forbidden: [specific prohibited actions]
Output: [exact deliverable format]
Max: [iterations, time, depth limits]
```