---
name: google-search
description: Web search and content extraction via Google Custom Search API.
---

# Google Search Skill

Web search and content extraction using Google Custom Search API.

## Setup

### 1. Google Cloud Console

1. [Create a new project](https://console.cloud.google.com/projectcreate) (or select existing).
2. [Enable the Custom Search API](https://console.cloud.google.com/apis/api/customsearch.googleapis.com).
3. [Set app name](https://console.cloud.google.com/auth/branding) in OAuth branding.
4. [Add test users](https://console.cloud.google.com/auth/audience) (the Gmail address you will use).
5. [Create OAuth client](https://console.cloud.google.com/auth/clients):
   - Click "Create Client"
   - Application type: "Desktop app"
   - Download the JSON file and save it to `~/.google-search/credentials.json`.

### 2. Programmable Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/about/).
2. Create a new search engine.
3. In "Basic" settings, copy the "Search engine ID" (CX).
4. Set the `GOOGLE_SEARCH_CX` environment variable.

## Usage

The script `search.js` handles both authentication and searching.

```bash
node {baseDir}/search.js "query" [-n <num>] [--content]
```

- `-n <num>`: Number of results (default: 5, max: 10).
- `--content`: Fetch and extract readable content as Markdown.

### First Run

On the first run, the script will open your browser to perform the OAuth flow. After granting permission, it will save a token to `~/.google-search/token.json` for future use.

## Data Storage

- `~/.google-search/credentials.json`: OAuth client credentials.
- `~/.google-search/token.json`: OAuth access and refresh tokens.
