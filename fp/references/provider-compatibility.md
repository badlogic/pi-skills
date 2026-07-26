# Provider Compatibility Profile

Load when encountering third-party proxy, gateway, retry loops, or encoding issues.

## Detection

- Repeated tool failures with the same error
- Encoding/garbled characters in API responses
- Connection resets or timeout loops
- Proxy/gateway between agent and model

## Protocol

1. **Isolate the layer**: Is the issue at the model, proxy, or tool level?
2. **Check encoding**: Verify request/response encoding matches provider spec
3. **Retry strategy**: Exponential backoff, max 3 retries, different transport if available
4. **Fallback**: If proxy is the issue, try direct connection or alternate route
5. **Report**: Document the failure pattern for future detection

## Provider-Specific Notes

- DeepSeek: v-final scores 3.14 vs 2.97 baseline in blind eval; benefits from structured routing
- OpenAI/Anthropic: Standard API behavior expected
- Custom providers: Validate against OpenAI-compatible API spec