#!/bin/bash
# chrome-open-macos.sh — Launch Chrome on macOS with CDP enabled
# Usage: chrome-open-macos.sh [--profile]
#
# Checks if Chrome is already running. If not, launches it.
# Waits for CDP port 9222 to be ready before returning.

PROFILE_FLAG=""
if [[ "$1" == "--profile" ]]; then
  PROFILE_FLAG="--profile"
fi

# Check if Chrome is already running on 9222
if curl -s http://localhost:9222/json/list > /dev/null 2>&1; then
  echo "✓ Chrome already running on :9222"
  exit 0
fi

# Launch Chrome with remote debugging
echo "Launching Chrome with remote debugging..."
if [[ -n "$PROFILE_FLAG" ]]; then
  open /Applications/Google\ Chrome.app --args --remote-debugging-port=9222 &
else
  open /Applications/Google\ Chrome.app --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
fi

# Wait for CDP port to be ready (max 10 seconds)
for i in {1..20}; do
  if curl -s http://localhost:9222/json/list > /dev/null 2>&1; then
    echo "✓ Chrome CDP ready on :9222"
    exit 0
  fi
  sleep 0.5
done

echo "✗ Chrome failed to start or CDP not responding"
exit 1
