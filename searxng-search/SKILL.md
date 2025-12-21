---
name: searxng-search
description: Web search and content extraction via local SearXNG instance. No API keys, no rate limits. Requires SearXNG running on localhost:8080.
---

# SearXNG Search

Local web search using SearXNG metasearch engine. No external API keys required.

## Quick Start

First-time setup (installs dependencies and starts SearXNG):

```bash
cd {baseDir}
npm install
./docker.sh setup
```

The setup script will:
- Create configuration at `~/searxng-simple/config/settings.yml`
- Pull the SearXNG Docker image
- Start the container on `http://localhost:8080`
- Enable JSON API format (required for search)

## Managing SearXNG

```bash
{baseDir}/docker.sh status    # Check if running
{baseDir}/docker.sh start     # Start container
{baseDir}/docker.sh stop      # Stop container
{baseDir}/docker.sh restart   # Restart container
{baseDir}/docker.sh logs      # View logs
{baseDir}/docker.sh remove    # Remove container (keeps config)
```

The Docker container runs with `--restart unless-stopped`, so it will automatically start on system reboot.

## Search

```bash
{baseDir}/search.js "query"                    # Basic search (5 results)
{baseDir}/search.js "query" -n 10              # More results
{baseDir}/search.js "query" --content          # Include page content as markdown
{baseDir}/search.js "query" -n 3 --content     # Combined
```

## Extract Page Content

```bash
{baseDir}/content.js https://example.com/article
```

Fetches a URL and extracts readable content as markdown.

## Output Format

```
--- Result 1 ---
Title: Page Title
Link: https://example.com/page
Snippet: Description from search results
Content: (if --content flag used)
  Markdown content extracted from the page...

--- Result 2 ---
...
```

## Advantages

- ✅ No API keys required
- ✅ No rate limits
- ✅ Privacy-preserving (local instance)
- ✅ Aggregates results from multiple search engines
- ✅ Fast and reliable
- ✅ Easy Docker management (included)

## When to Use

- Searching for documentation or API references
- Looking up facts or current information
- Fetching content from specific URLs
- Any task requiring web search without external dependencies
