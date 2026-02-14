---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled.

## Setup

Run once before first use:

```bash
cd {baseDir}/browser-tools
npm install
```

## Start Chrome

```bash
{baseDir}/browser-start.js              # Fresh profile
{baseDir}/browser-start.js --profile    # Copy user's profile (cookies, logins)
```

Launch Chrome with remote debugging on `:9222`. Use `--profile` to preserve user's authentication state.

## Core Tools

### Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

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

Refs identify interactive elements. Use them with other tools:

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
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract specific data, inspect state, or perform DOM operations after understanding page structure.

**Ref-Based Interaction**:
```bash
# Use refs from browser-page-structure.js for easy element targeting
./browser-eval.js 'document.querySelector("[ref=e5]").click()'
```

This works because refs are stored as attributes on the DOM elements, making them queryable with standard CSS selectors.

### Screenshot

```bash
{baseDir}/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use sparingly - prefer DOM inspection via `browser-page-structure.js` or `browser-eval.js` for efficiency.

### Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

### Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

### Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).

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

# 2. Navigate to discovered links (use exact URLs)
{baseDir}/browser-nav.js <exact-url-from-snapshot>

# 3. Analyze new page (same stable ID)
{baseDir}/browser-page-structure.js --id A5A3072972ABBE08577A7CD3F62DF08D
```

**CRITICAL**: NEVER invent, guess, or construct URLs. Only use URLs exactly as discovered in ARIA snapshot.

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
