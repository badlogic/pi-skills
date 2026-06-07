#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ] || [ $# -ne 1 ]; then
  echo "Usage: transcribe.sh <audio-file>"
  echo
  echo "Outputs timestamped transcript lines: [MM:SS-MM:SS] text"
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "Error: transcribe skill requires Apple Silicon macOS" >&2
  exit 1
fi

INPUT="$1"
if [ ! -f "$INPUT" ]; then
  echo "Error: file not found: $INPUT" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
BIN_DIR="$EXTENSION_DIR/bin"
BIN="$BIN_DIR/parakeet-cpp-transcribe"
VERSION="parakeet-cpp-transcribe-v0.1.2"
ASSET="parakeet-cpp-transcribe-macos-arm64.tar.gz"
URL="https://github.com/badlogic/pibot/releases/download/$VERSION/$ASSET"

CLEANUP_PATHS=()
cleanup() {
  if [ ${#CLEANUP_PATHS[@]} -gt 0 ]; then
    rm -rf "${CLEANUP_PATHS[@]}"
  fi
}
trap cleanup EXIT

if [ ! -x "$BIN" ] || ! "$BIN" --help 2>/dev/null | grep -q -- "--text"; then
  mkdir -p "$BIN_DIR"
  TMP_DIR="$(mktemp -d)"
  CLEANUP_PATHS+=("$TMP_DIR")
  echo "Installing parakeet-cpp-transcribe into $BIN_DIR..." >&2
  curl -fL "$URL" -o "$TMP_DIR/$ASSET"
  rm -f "$BIN"
  tar -xzf "$TMP_DIR/$ASSET" -C "$BIN_DIR"
  chmod +x "$BIN"
fi

AUDIO="$INPUT"
LOWER="$(printf '%s' "$INPUT" | tr '[:upper:]' '[:lower:]')"
if [[ "$LOWER" != *.wav ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Error: ffmpeg is required for non-WAV input. Install with: brew install ffmpeg" >&2
    exit 1
  fi
  TMP_WAV="$(mktemp -t transcribe.XXXXXX).wav"
  CLEANUP_PATHS+=("$TMP_WAV")
  ffmpeg -y -loglevel error -i "$INPUT" -ac 1 -ar 16000 "$TMP_WAV"
  AUDIO="$TMP_WAV"
fi

"$BIN" --text "$AUDIO"
