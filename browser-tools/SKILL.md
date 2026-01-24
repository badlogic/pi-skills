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
{baseDir}/browser-start.js                        # Fresh profile
{baseDir}/browser-start.js --profile              # Copy Default profile (cookies, logins)
{baseDir}/browser-start.js --profile "Work"       # Copy specific profile by name
{baseDir}/browser-start.js --profile-last-used    # Copy last used profile
```

Launch Chrome with remote debugging on `:9222`.

**Default behavior:** when the user does **not** mention a profile, use a fresh profile (`browser-start.js` with no flags).

**When to use profiles:**
- User says "with profile" or "use my profile" **without naming one** → use `--profile` (Default profile).
- User names a profile (e.g., "pi profile" or "profile pi") → resolve it and use `--profile "Profile X"`.
- User explicitly says "last used" → use `--profile-last-used`.

## Profiles

```bash
{baseDir}/browser-profiles.js
```

When a user asks for a profile by name:
1. Run `browser-profiles.js` and review the list (`Name (Profile X)`).
2. If exactly one entry matches, use its directory with `browser-start.js --profile "Profile X"`.
3. If there is no clear match or multiple matches, show the list and ask the user to pick.

## Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

## Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract data, inspect page state, or perform DOM operations programmatically.

## Screenshot

```bash
{baseDir}/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use this to visually inspect page state or verify UI changes.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

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
