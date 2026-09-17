#!/bin/sh
set -eux
cat > "$STUBS/docker" <<'EOF'
#!/bin/sh
printf 'docker %s\n' "$*" >> "$CALLS"
case "$*" in
  "inspect --format {{.State.Status}} dnd-portal") echo running ;;
  "inspect --format {{.State.Status}} dnd-bot") cat "$WORK/bot-status" ;;
  "inspect --format {{.State.Health.Status}} dnd-bot") cat "$WORK/bot" ;;
  "inspect --format {{.State.Health.Status}} dnd-portal") echo healthy ;;
esac
exit 0
EOF
cat > "$STUBS/curl" <<'EOF'
#!/bin/sh
cat > /dev/null
echo alert >> "$CALLS"
EOF
chmod +x "$STUBS/docker" "$STUBS/curl"
printf 'https://discord.invalid/api/webhooks/1/x\n' > "$WORK/hook"
export PATH="$STUBS:$PATH" ALERT_WEBHOOK_FILE="$WORK/hook" STATE_DIR="$WORK/state" THRESHOLD=2
echo running > "$WORK/bot-status"
echo unhealthy > "$WORK/bot"
restarts() { grep -c "docker restart $1" "$CALLS" || true; }

# May be recording: never restarts the bot, alerts once.
RECORDING_CHECK=true sh "$ROOT/deploy/autoheal.sh"
RECORDING_CHECK=true sh "$ROOT/deploy/autoheal.sh"
RECORDING_CHECK=true sh "$ROOT/deploy/autoheal.sh"
[ "$(restarts dnd-bot)" = 0 ]
[ "$(grep -c '^alert' "$CALLS")" = 1 ]

# Not recording: restarts on the second unhealthy check, then resets.
rm -rf "$WORK/state"; : > "$CALLS"
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
[ "$(restarts dnd-bot)" = 0 ]
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
[ "$(restarts dnd-bot)" = 1 ]
[ "$(restarts dnd-portal)" = 0 ]
[ "$(cat "$WORK/state/dnd-bot")" = 0 ]

# Healthy resets the counter.
echo 1 > "$WORK/state/dnd-bot"; echo healthy > "$WORK/bot"
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
[ "$(cat "$WORK/state/dnd-bot")" = 0 ]

# A stopped container alerts once, and again when it comes back.
: > "$CALLS"; echo exited > "$WORK/bot-status"
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
[ "$(grep -c '^alert' "$CALLS")" = 1 ]
echo running > "$WORK/bot-status"
RECORDING_CHECK=false sh "$ROOT/deploy/autoheal.sh"
[ "$(grep -c '^alert' "$CALLS")" = 2 ]
