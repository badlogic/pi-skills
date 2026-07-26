# Debug Incident Profile

Load when facing an unknown failure and the task is diagnosis-only (no fix yet).

## Protocol

1. **Pin the symptom**: Exact error message, timing, trigger conditions
2. **Read-only baseline**: Gather logs, metrics, state without mutation
3. **One falsifiable hypothesis**: Form a specific, testable theory
4. **One probe**: Run a single diagnostic test
5. **Narrow or pivot**: If probe narrows the cause, continue; if not, form new hypothesis
6. **Three non-narrowing probes → stop**: Switch to structural method (bisect, minimal reproduction, causal boundary trace)

## Output

- Location of failure
- Symptom observed
- Root cause (or `unknown` if not found)
- Evidence supporting conclusion
- Next step: fix proposal or further diagnosis needed