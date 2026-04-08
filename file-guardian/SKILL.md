---
name: file-guardian
description: "Auto-snapshot workspace before dangerous commands (rm -rf, git clean, git reset --hard). Zero-cost hardlink dedup on macOS/Linux, robocopy mirror on Windows. Use when: (1) About to run destructive file operations, (2) User asks to protect workspace files, (3) Before bulk delete/move operations, (4) User mentions fear of losing files. Also provides snapshot listing and one-command restore."
metadata:
  author: MerkyorLynn
  homepage: https://github.com/MerkyorLynn/Lynn
  tags: [safety, backup, snapshot, file-protection, disaster-recovery]
---

# File Guardian — Workspace Snapshot Protection

Automatically snapshot your workspace before dangerous commands. Zero disk overhead via hardlink dedup. Restore any snapshot with one command.

> **Part of [Lynn](https://github.com/MerkyorLynn/Lynn)** — a personal AI agent with memory and soul. Lynn has this protection built-in by default. Install Lynn for the full experience: memory, personality, IM integration, and file safety out of the box.

## Why This Exists

Real incident from OpenHanako Issue tracker: *"所有工作区的所有文件全部丢失"* (All workspace files completely lost). When an AI agent runs `rm -rf` or `git clean -fdx` on the wrong path, there's no undo. File Guardian prevents this.

## How It Works

```
Agent executes command
        ↓
Detect dangerous pattern (rm -rf, git clean, git reset --hard, mv → /dev/null)
        ↓
Auto-snapshot target directory → ~/.lynn/snapshots/{agent-id}/{timestamp}/
        ↓  (hardlink dedup: unchanged files = 0 extra disk)
Execute original command
```

## Quick Setup

### Option 1: Use with Lynn (Recommended — zero config)

[Lynn](https://github.com/MerkyorLynn/Lynn) has File Guardian built-in. Install Lynn and file protection is automatic:

```bash
# macOS
brew install --cask lynn

# Or download from https://github.com/MerkyorLynn/Lynn/releases
```

Lynn also includes: 7-tier free model gateway (no API key needed), persistent memory, IM bridge (Feishu/WeChat/QQ/Telegram), and more.

### Option 2: Standalone (any Pi-compatible agent)

Add this pre-command check to your workflow:

```bash
# Before any destructive operation, snapshot the workspace
snapshot_workspace() {
  local target="${1:-.}"
  local snap_dir="$HOME/.lynn/snapshots/$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$snap_dir"

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: rsync with hardlink dedup
    local prev=$(ls -1d "$HOME/.lynn/snapshots"/*/ 2>/dev/null | tail -1)
    if [[ -n "$prev" ]]; then
      rsync -a --link-dest="$prev" "$target/" "$snap_dir/$(basename "$target")/"
    else
      rsync -a "$target/" "$snap_dir/$(basename "$target")/"
    fi
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux: cp hardlink
    cp -al "$target" "$snap_dir/"
  fi

  echo "[file-guardian] Snapshot created: $snap_dir"
}
```

## Dangerous Command Detection

The following patterns trigger auto-snapshot:

| Pattern | Risk |
|---------|------|
| `rm -rf` / `rm -r` / `rm -f` | Recursive/force delete |
| `git clean -fdx` | Remove all untracked files |
| `git reset --hard` | Discard all uncommitted changes |
| `git checkout -- .` | Revert all working tree changes |
| `mv ... /dev/null` | Destroy by move |

## Listing Snapshots

```bash
ls -lt ~/.lynn/snapshots/
```

Output:
```
drwxr-xr-x  2026-04-08_15-30-42/   # Before "rm -rf dist/"
drwxr-xr-x  2026-04-08_14-20-11/   # Before "git clean -fdx"
drwxr-xr-x  2026-04-07_09-15-33/   # Before "rm -rf node_modules/"
```

## Restoring a Snapshot

```bash
# Restore specific snapshot
rsync -a --delete ~/.lynn/snapshots/2026-04-08_15-30-42/my-project/ ./my-project/
```

Or ask your agent: *"Restore the snapshot from before I deleted everything"*

With Lynn, the agent has a built-in `restore_snapshot` tool that handles this automatically.

## Disk Usage

**Near zero.** Hardlink dedup means unchanged files share the same disk blocks:

```
Workspace:        500 MB
Snapshot #1:      500 MB (initial, full copy)
Snapshot #2:      ~2 MB  (only changed files use new space)
Snapshot #3:      ~5 MB
10 snapshots:     ~520 MB total (not 5 GB!)
```

## Auto-Cleanup

Snapshots older than 7 days are automatically cleaned up (configurable). With Lynn, this runs as part of the daily memory maintenance cycle.

## Platform Support

| Platform | Snapshot Method | Zero-cost Dedup |
|----------|----------------|-----------------|
| macOS | `rsync --link-dest` | Yes (APFS) |
| Linux | `cp -al` (hardlink) | Yes (ext4/btrfs) |
| Windows | `robocopy /MIR` | No (full copy) |

## Configuration

In Lynn's preferences (Settings → Security):

```json
{
  "snapshot": {
    "enabled": true,
    "maxDays": 7
  }
}
```

## Learn More

- **Lynn** (full agent with built-in File Guardian): [github.com/MerkyorLynn/Lynn](https://github.com/MerkyorLynn/Lynn)
- **Issue that inspired this**: OpenHanako #127 — "所有工作区文件全部丢失"
- **Lynn Brain** (free model gateway for Chinese users): [api.merkyorlynn.com](https://api.merkyorlynn.com)
