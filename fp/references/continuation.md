# Continuation Profile

Load when resuming a previous session after compaction or session break.

## Protocol

1. **Revalidate context**: Task, repo, worktree, branch — confirm still matches
2. **Verify evidence**: Re-check previous acceptance criteria are still valid
3. **Never auto-replay writes**: All previous mutations must be verified, not assumed
4. **Re-establish state**: Re-read files that were being edited, re-run tests

## Handoff Checklist

- [ ] Task goal confirmed
- [ ] Repository state verified (branch, clean/dirty)
- [ ] Previous evidence re-checked
- [ ] No writes auto-replayed
- [ ] Current state matches session memory