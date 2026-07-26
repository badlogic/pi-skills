# Live System Profile

Load when working with remote/stateful targets (OpenWrt, embedded, routers, production servers).

## Protocol

1. **Preserve management path**: Never close the only SSH/access route
2. **Create rollback**: Before any mutation, ensure a revert path exists
3. **Verify with real client path**: Test through the actual user-facing interface
4. **Resource ownership**: Confirm no other process holds locks/mutexes
5. **Lifecycle awareness**: Understand start/stop/restart behavior before touching services

## Verification Checklist

- [ ] Management path preserved
- [ ] Rollback tested or trivially reversible
- [ ] Real client path verified
- [ ] No resource conflicts
- [ ] Lifecycle handled (restart/reload as needed)