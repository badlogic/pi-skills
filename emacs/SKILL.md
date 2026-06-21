---
name: emacs
description: Emacs integration for capturing current selection, buffer, and persp context via emacsclient. Use when working in Emacs and need editor context.
---

# Emacs Integration

Use `emacsclient` to query the active Emacs session for context: buffer, selection, cursor, and buffer list (optionally scoped to persp-mode). It prefers the buffer with an active region and falls back to the selected window buffer.

## Requirements

- Emacs server running (`M-x server-start` or `emacs --daemon`)
- `emacsclient` available in PATH
- Emacs 27+ (for `json-serialize`)

## Detecting Emacs

When running inside Emacs/vterm, environment variables are usually set:

```bash
echo $INSIDE_EMACS
echo $TERM_PROGRAM
```

Verify the server is reachable:

```bash
emacsclient --eval "(emacs-version)"
```

## Get Current Context

```bash
{baseDir}/scripts/context.sh
```

Outputs JSON to stdout with:

- `buffer`: active-region buffer (if any) or selected window buffer (name, file, mode, modified, active)
- `cursor`: line/column
- `selection`: selected text and range (empty object when no active region)
- `persp`: current persp name (if persp-mode is loaded)
- `project`: project root (if project.el is available)
- `buffers`: file-backed buffers in the current persp (or all buffers when no persp)

If you have a region active in another buffer (e.g., you are in vterm but selected text in a file buffer), the selection and `buffer` fields will reflect that active region.
