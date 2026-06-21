#!/usr/bin/env bash
set -euo pipefail

if ! command -v emacsclient >/dev/null 2>&1; then
  echo "emacsclient not found in PATH." >&2
  exit 1
fi

if ! emacsclient --quiet --eval "(emacs-version)" >/dev/null 2>&1; then
  echo "Emacs server not running. Start it with 'M-x server-start' or 'emacs --daemon'." >&2
  exit 1
fi

base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="${TMPDIR:-/tmp}"
tmp_file="$(mktemp "${tmp_dir%/}/pi-emacs-context.XXXXXX")"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

emacsclient --quiet --eval "(progn (load-file \"${base_dir}/scripts/context.el\") (pi-emacs-context-to-file \"${tmp_file}\"))" >/dev/null
cat "$tmp_file"
