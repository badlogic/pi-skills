---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled.

## Setup

Run once before first use:

```bash
cd {baseDir}
npm install
```

## Start Chrome

```bash
{baseDir}/browser-start.js              # Fresh profile
{baseDir}/browser-start.js --profile    # Copy user's profile (cookies, logins)
```

Launch Chrome with remote debugging on `:9222`. Use `--profile` to preserve user's authentication state.

> Note: `--profile` supports Google Chrome profiles on both macOS and Linux. Chromium users should skip this option.

If Chrome is already running with `--remote-debugging-port=9222` (e.g., configured as the default launcher), the script detects it and attaches to the existing instance — no new process is started. This is the preferred workflow when the user's browser is already CDP-enabled.

Supports both macOS and Linux. On Linux, searches for `google-chrome-stable`, `google-chrome`, `chromium-browser`, or `chromium` in PATH.

## Quick Tool Selection

- Need to understand selected page (defaults to last page) → `browser-page-structure.js --depth 2`, then full snapshot if needed
- Need to navigate → `browser-nav.js <exact discovered URL>`
- Need page data/state → `browser-eval.js '<JS expression>'`
- Need visible layout/spatial info → `browser-page-structure.js --boxes` (use sparingly; boxes increase token output) or screenshot as fallback
- Need user to choose an element → `browser-pick.js`
- Need cookies/auth debugging → `browser-cookies.js`
- Need readable article content → `browser-content.js <url>` (use only with URLs provided by the user or discovered from page structure)

> **Note:** Page-bound tools support `--id <targetId>` and `--page <index|last|-1>` for consistent tab selection. Use `browser-page-structure.js --list` to discover stable IDs.

## Core Tools

### Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --id A5A3072972ABBE08577A7CD3F62DF08D
{baseDir}/browser-nav.js https://example.com --page 0
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--id` or `--page` to target a specific existing tab. Use `--new` to open in a new tab instead of reusing an existing one. `--new` is mutually exclusive with `--id` and `--page`.

### Page Structure

```bash
# List all available pages with stable IDs
{baseDir}/browser-page-structure.js --list

# Get ARIA snapshot of specific page by stable ID (recommended)
{baseDir}/browser-page-structure.js --id A5A3072972ABBE08577A7CD3F62DF08D

# Get ARIA snapshot of specific page by index (unstable)
{baseDir}/browser-page-structure.js --page 0

# Get ARIA snapshot of last page (default)
{baseDir}/browser-page-structure.js
```

**Use this FIRST when exploring unknown pages.** Returns ARIA snapshot in Playwright-compatible YAML format with:

- **Full ARIA tree** with roles, accessible names, element states
- **Interactive element refs** (`[ref=e1]`, `[ref=e2]`, etc.)
- **Links with URLs** for navigation
- **Element states**: checked, disabled, expanded, pressed, selected, level, active
- **Cursor indicators** (`[cursor=pointer]`)

Options:
- `--depth N` — limit tree to depths 0 through N (saves context on complex pages)
- `--boxes` / `-b` — include bounding box coordinates `[box=x,y,w,h]` for spatial reasoning

#### Page Selection

When browser has multiple tabs:

1. **List pages**: `{baseDir}/browser-page-structure.js --list`
   - Shows each page's stable ID, index, URL, and title

2. **Select by stable ID** (recommended): `--id A5A3072972ABBE08577A7CD3F62DF08D`
   - Persists across tab moves and navigation

3. **Select by index** (fallback): `--page 0` or `--page last`
   - Changes if user rearranges tabs

**Always use `--id` from `--list` output** - indices are unstable.

#### LLM Capabilities

With the ARIA snapshot, you can:

- **Understand page structure** (roles, landmarks, hierarchy)
- **Identify interactive elements** (buttons, links, inputs, forms)
- **See element states** (checked/unchecked, disabled/enabled, expanded/collapsed)
- **Navigate using discovered URLs** from links
- **Construct selectors** using role + name
- **Plan multi-step interactions** based on visible options

#### Example Output

```yaml
# PAGE INFO
url: https://example.com
title: Example Page

# ARIA SNAPSHOT (Playwright-compatible)
- generic [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - link "Home" [ref=e4] [cursor=pointer]:
        - /url: /
      - link "About" [ref=e5] [cursor=pointer]:
        - /url: /about
  - main [ref=e6]:
    - heading "Welcome" [level=1] [ref=e7]
    - button "Submit" [ref=e8] [cursor=pointer]
    - textbox "Email" [ref=e9]
```

#### Working with Refs

Refs in the ARIA snapshot identify elements for reasoning about the page, but they are **not** stored as DOM attributes. To interact with elements, locate them by role/name/text/CSS selectors using `browser-eval.js`, or use `browser-pick.js` when ambiguous.

```bash
# Navigate using discovered URL
{baseDir}/browser-nav.js https://example.com/about

# Visually select element
{baseDir}/browser-pick.js "Select the submit button"

# Find elements by role/name (in browser-eval.js)
Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Submit')
```

### Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length' --id A5A3072972ABBE08577A7CD3F62DF08D
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length' --page 0
```

Execute JavaScript in the selected tab (default: last page). Code runs in async context. Use this to extract specific data, inspect state, or perform DOM operations after understanding page structure.

Locate elements by standard DOM selectors:
```bash
# Find by CSS selector
{baseDir}/browser-eval.js 'document.querySelector("#submit-btn").click()'

# Find by role and text content
{baseDir}/browser-eval.js 'Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Submit").click()'
```

### Screenshot

```bash
{baseDir}/browser-screenshot.js
{baseDir}/browser-screenshot.js --id A5A3072972ABBE08577A7CD3F62DF08D
{baseDir}/browser-screenshot.js --page 0
```

Capture current viewport and return temporary file path. Use sparingly - prefer DOM inspection via `browser-page-structure.js` or `browser-eval.js` for efficiency.

### Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
{baseDir}/browser-pick.js "Click the submit button" --id A5A3072972ABBE08577A7CD3F62DF08D
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

### Cookies

```bash
{baseDir}/browser-cookies.js
{baseDir}/browser-cookies.js --id A5A3072972ABBE08577A7CD3F62DF08D
```

Display all cookies for the selected tab (default: last page), including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

### Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
{baseDir}/browser-content.js https://example.com --id A5A3072972ABBE08577A7CD3F62DF08D
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load). Use only with URLs provided by the user or discovered from page structure.

## When to Use

- Testing frontend code in a real browser
- Interacting with pages that require JavaScript
- When user needs to visually see or interact with a page
- Debugging authentication or session issues
- Scraping dynamic content that requires JS execution
- Exploring unknown applications or complex web apps

## Best Practices

### Page Exploration Workflow

**ALWAYS start with page structure analysis:**

```bash
# 1. List pages and select by stable ID
{baseDir}/browser-page-structure.js --list
{baseDir}/browser-page-structure.js --id A5A3072972ABBE08577A7CD3F62DF08D

# 2. Navigate to discovered links in the same tab (use exact URLs)
{baseDir}/browser-nav.js <exact-url-from-snapshot> --id A5A3072972ABBE08577A7CD3F62DF08D

# 3. Analyze new page (same stable ID)
{baseDir}/browser-page-structure.js --id A5A3072972ABBE08577A7CD3F62DF08D
```

**CRITICAL**: NEVER invent, guess, or construct URLs. Only use URLs exactly as discovered in ARIA snapshot.

**Managing context window on complex pages:**
```bash
# Start with a shallow overview to understand page structure
{baseDir}/browser-page-structure.js --depth 2

# Then get full detail once you know what to focus on
{baseDir}/browser-page-structure.js

# Include bounding boxes when spatial reasoning matters (e.g. "top-right button")
# Use sparingly; boxes increase token output
{baseDir}/browser-page-structure.js --boxes
```

### DOM Inspection Over Screenshots

**Don't** take screenshots to see page state. **Do** use `browser-page-structure.js` or `browser-eval.js`:

```javascript
// Get specific element details
document.querySelector('#target').textContent

// Find interactive elements
Array.from(document.querySelectorAll('button, input, [role="button"]')).map(e => ({
  id: e.id,
  text: e.textContent.trim(),
  class: e.className
}))
```

### Efficient JavaScript Evaluation

**Wrap in IIFE** for multi-statement code:

```javascript
(function() {
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  buttons[0].click();
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

**Batch interactions** in one call:

```javascript
(function() {
  ["btn1", "btn2", "btn3"].forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

**Wait for DOM updates** with promises:

```javascript
(function() {
  return new Promise(resolve => {
    setTimeout(() => resolve(document.querySelector('.result').textContent), 500);
  });
})()
```
