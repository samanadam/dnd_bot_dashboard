#!/bin/sh
# Docker marks containers unhealthy but never restarts them. Restart after
# THRESHOLD consecutive unhealthy checks. The bot is left alone while it may be
# recording: a stuck bot with a live recording needs a human, not a restart.
set -eu
. "$(dirname "$0")/lib/alert.sh"

CONTAINERS="${CONTAINERS:-dnd-bot dnd-portal}"
STATE_DIR="${STATE_DIR:-/var/lib/dnd-autoheal}"
THRESHOLD="${THRESHOLD:-3}"
RECORDING_CHECK="${RECORDING_CHECK:-docker exec dnd-bot python /app/scripts/recording_active.py}"
mkdir -p "$STATE_DIR"

for name in $CONTAINERS; do
  state_file="$STATE_DIR/$name"
  count=$(cat "$state_file" 2>/dev/null || echo 0)
  status=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo missing)
  if [ "$status" != running ]; then
    if [ ! -f "$state_file.down" ]; then
      alert "$name is $status."
      : > "$state_file.down"
    fi
    continue
  fi
  if [ -f "$state_file.down" ]; then
    rm -f "$state_file.down"
    alert "$name is running again."
  fi

  health=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo none)
  if [ "$health" != unhealthy ]; then
    echo 0 > "$state_file"
    continue
  fi

  count=$((count + 1))
  if [ "$count" -lt "$THRESHOLD" ]; then
    echo "$count" > "$state_file"
    continue
  fi

  if [ "$name" = dnd-bot ] && sh -c "$RECORDING_CHECK" >/dev/null 2>&1; then
    # Alert once per streak, not every two minutes.
    [ "$count" -eq "$THRESHOLD" ] && alert "dnd-bot is unhealthy and may be recording. Not restarting it automatically."
    echo "$count" > "$state_file"
    continue
  fi

  docker restart "$name" >/dev/null
  alert "$name was unhealthy for $count checks in a row and has been restarted."
  echo 0 > "$state_file"
done
