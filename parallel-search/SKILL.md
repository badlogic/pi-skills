---
name: parallel-search
description: Web search and page fetching via Parallel Search MCP. Use for current information, documentation research, and reading source URLs. No API key or browser required.
---

# Parallel Search

Search the web and fetch page excerpts with [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp), using [MCPorter](https://github.com/openclaw/mcporter) from the terminal. Anonymous searches use Fast mode. The free endpoint needs no account or API key and has usage limits.

## Setup

Requires Node.js 24 or newer. Install MCPorter once:

```bash
npm install -g mcporter@0.15.0
```

Run the following commands from this skill's directory. The bundled `mcporter.json` selects the Parallel endpoint without importing other MCP configurations. Pass `--config ./mcporter.json` on every command.

Inspect the current tool parameters:

```bash
mcporter --config ./mcporter.json list parallel-search --all-parameters
```

## Search

Generate a session ID once per conversation and reuse it for related search and fetch calls:

```bash
PARALLEL_SEARCH_SESSION=$(node -p 'crypto.randomUUID()')

mcporter --config ./mcporter.json call parallel-search.web_search \
  objective="Find the Node.js documentation for the built-in test runner" \
  'search_queries=["Node.js test runner documentation"]' \
  session_id="$PARALLEL_SEARCH_SESSION" --output json
```

Use a focused objective and one or more short keyword queries. For freshness or source preferences, include them in the objective or query. Check the returned titles, URLs, and excerpts before choosing pages to fetch.

## Fetch pages

```bash
mcporter --config ./mcporter.json call parallel-search.web_fetch \
  'urls=["https://nodejs.org/api/test.html"]' \
  objective="How do I run tests with the built-in test runner?" \
  'search_queries=["Node.js test runner documentation"]' \
  session_id="$PARALLEL_SEARCH_SESSION" --output json
```

Replace the example URL with relevant search results, or supply URLs you already know. `urls` accepts up to 20 HTTP or HTTPS URLs. Keep the optional fetch objective within 200 characters and reuse the search queries when following search results. The default output contains excerpts; add `full_content=true` only when the complete page is needed, since it can be large.

## Research workflow

1. Search for the question with a focused objective.
2. Fetch promising source URLs to check details in context.
3. Answer using the retrieved evidence and cite the original URLs. Report gaps or conflicting sources.

The CLI prints the tool response as JSON. Read tool errors as failures, even if the CLI exits successfully. If the service reports a usage limit, respect its retry guidance and tell the user the request could not complete. Keep the same session ID within a conversation. See the [service documentation](https://docs.parallel.ai/integrations/mcp/search-mcp) for authenticated access with higher limits.
