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
{baseDir}/browser-page-structure.js
```

**Use this FIRST when exploring unknown pages.** Returns comprehensive page analysis as JSON:

- **Location**: Current URL, path, and page title
- **Links**: All links (a[href], [role="link"]) with text, href, and semantic location (nav/header/main/footer/aside)
- **Navigation**: Specifically extracted nav/header links with current page indicators
- **Outline**: Page structure via h1, h2, h3 headings
- **Landmarks**: Count of semantic regions (nav, main, header, footer, sidebar, search)
- **Interactive**: Count of buttons, forms, inputs, menus, tabs, dialogs
- **Forms**: Detailed form info including fields, labels, and types

Use this to understand page structure, discover navigation options, and find interactive elements before taking actions.

### Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract specific data, inspect state, or perform DOM operations after understanding page structure.

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
# 1. Understand the page
{baseDir}/browser-page-structure.js

# 2. Navigate to discovered links
{baseDir}/browser-nav.js <exact-url-from-structure>

# 3. Interact with specific elements
{baseDir}/browser-eval.js '...'
```

**CRITICAL**: NEVER invent, guess, or construct URLs. Only use URLs exactly as discovered by `browser-page-structure.js`.

### DOM Inspection Over Screenshots

**Don't** take screenshots to see page state. **Do** use `browser-page-structure.js` or parse the DOM directly:

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

**Complex Scripts**: Wrap everything in an IIFE for multi-statement code:

```javascript
(function() {
  // Multiple operations
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  
  // Interactions
  buttons[0].click();
  
  // Return results
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

**Batch Interactions**: Don't make separate calls for each action:

```javascript
(function() {
  const actions = ["btn1", "btn2", "btn3"];
  actions.forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

**Typing/Input Sequences**:

```javascript
(function() {
  const text = "HELLO";
  for (const char of text) {
    document.getElementById("key-" + char).click();
  }
  document.getElementById("submit").click();
  return "Submitted: " + text;
})()
```

### Reading Dynamic State

Extract structured state in one call:

```javascript
(function() {
  const state = {
    score: document.querySelector('.score')?.textContent,
    status: document.querySelector('.status')?.className,
    items: Array.from(document.querySelectorAll('.item')).map(el => ({
      text: el.textContent,
      active: el.classList.contains('active')
    }))
  };
  return JSON.stringify(state, null, 2);
})()
```

### Waiting for Updates

If DOM updates after actions, add a small delay:

```bash
sleep 0.5 && {baseDir}/browser-eval.js '...'
```

Or use JavaScript promises:

```javascript
(function() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(document.querySelector('.result').textContent);
    }, 500);
  });
})()
```

### Custom Selectors for Specific Tasks

After using `browser-page-structure.js` to understand the page, write targeted selectors:

```javascript
// Extract data from discovered forms
(function() {
  const form = document.querySelector('form[name="login"]');
  return Array.from(form.elements).map(el => ({
    name: el.name,
    type: el.type,
    value: el.value
  }));
})()
```

```javascript
// Navigate using discovered navigation links
(function() {
  const link = Array.from(document.querySelectorAll('nav a'))
    .find(a => a.textContent.includes('Dashboard'));
  if (link) {
    link.click();
    return `Navigated to: ${link.href}`;
  }
  return 'Link not found';
})()
```
