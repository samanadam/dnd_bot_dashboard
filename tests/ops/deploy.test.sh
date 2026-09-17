#!/bin/sh
set -eux
# Fake docker: image id changes after pull; health comes from $WORK/health.
cat > "$STUBS/docker" <<'EOF'
#!/bin/sh
printf 'docker %s\n' "$*" >> "$CALLS"
case "$*" in
  "inspect --format {{.Image}} dnd-portal") cat "$WORK/image" ;;
  "inspect --format {{.State.Health.Status}} dnd-portal") cat "$WORK/health" ;;
  "compose pull portal") echo sha256:new > "$WORK/image" ;;
esac
exit 0
EOF
cat > "$STUBS/git" <<'EOF'
#!/bin/sh
printf 'git %s\n' "$*" >> "$CALLS"
EOF
chmod +x "$STUBS/docker" "$STUBS/git"
export PATH="$STUBS:$PATH" ALERT_WEBHOOK_FILE="$WORK/none" SLEEP=true HEALTH_TIMEOUT=3

# Healthy deploy.
echo sha256:old > "$WORK/image"; echo healthy > "$WORK/health"
sh "$ROOT/deploy/deploy.sh"
grep -q 'git pull --ff-only' "$CALLS"
grep -q 'docker compose up -d portal' "$CALLS"
if grep -q 'dnd-portal:rollback' "$CALLS"; then exit 1; fi

# Unhealthy deploy rolls back to the image that was running before the pull.
: > "$CALLS"; echo sha256:old > "$WORK/image"; echo unhealthy > "$WORK/health"
code=0; sh "$ROOT/deploy/deploy.sh" || code=$?
[ "$code" -eq 2 ]
grep -q 'docker tag sha256:old dnd-portal:rollback' "$CALLS"
