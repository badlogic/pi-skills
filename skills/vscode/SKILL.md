---
name: vscode
description: VS Code integration for viewing diffs and comparing files. Use when showing file differences to the user.
---

# VS Code CLI Tools

Tools for integrating with VS Code, primarily for viewing diffs.

## Requirements

VS Code must be installed with the `code` CLI available in PATH.

## Opening a Diff

Compare two files side by side in VS Code:

```bash
code -d <file1> <file2>
```

## Git Diffs in VS Code

### Simple Approach (no config needed)

Extract the old version to a temp file, then diff:

```bash
# Compare with previous commit
git show HEAD~1:path/to/file > /tmp/old && code -d /tmp/old path/to/file

# Compare with specific commit
git show abc123:path/to/file > /tmp/old && code -d /tmp/old path/to/file

# Compare staged version with working tree
git show :path/to/file > /tmp/staged && code -d /tmp/staged path/to/file
```

### Gotchas

- File must exist and have changes between the compared revisions
- Use `git log --oneline -5 -- path/to/file` to verify file has history before diffing

## When to Use

- Showing the user what changed in a file
- Comparing two versions of code
- Reviewing git changes visually
