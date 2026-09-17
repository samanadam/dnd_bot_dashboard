#!/bin/sh
set -eux
cat > "$STUBS/docker" <<'EOF'
#!/bin/sh
printf 'docker %s\n' "$*" | head -c 200 >> "$CALLS"
printf '\n' >> "$CALLS"
case "$*" in
  "exec dnd-portal test -f /app/data/portal.db") [ -f "$WORK/nodb" ] && exit 1; exit 0 ;;
  "exec dnd-portal node -e"*) [ -f "$WORK/fail" ] && exit 1; exit 0 ;;
  "exec dnd-portal cat"*) printf 'SQLite format 3\000rest' ;;
  "exec -i dnd-bot python -c"*) cat > "$WORK/uploaded"; echo uploaded ;;
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
export PATH="$STUBS:$PATH" ALERT_WEBHOOK_FILE="$WORK/hook" TODAY=2026-09-16

# Happy path: snapshot, upload, snapshot removed, no alert.
sh "$ROOT/deploy/backup-portal-db.sh"
grep -q 'exec dnd-portal node -e' "$CALLS"
grep -q 'exec -i dnd-bot python -c' "$CALLS"
grep -q 'exec dnd-portal rm -f /app/data/backup-2026-09-16.db' "$CALLS"
head -c 15 "$WORK/uploaded" | grep -q 'SQLite format 3'
if grep -q '^alert' "$CALLS"; then exit 1; fi

# Snapshot failure: non-zero exit and an alert.
: > "$CALLS"; touch "$WORK/fail"
code=0; sh "$ROOT/deploy/backup-portal-db.sh" || code=$?
[ "$code" -eq 1 ]
grep -q '^alert' "$CALLS"

# No database yet: success, nothing uploaded.
rm -f "$WORK/fail" "$WORK/uploaded"; : > "$CALLS"; touch "$WORK/nodb"
sh "$ROOT/deploy/backup-portal-db.sh"
[ ! -f "$WORK/uploaded" ]

# A malformed date is refused.
code=0; TODAY="2026-09-16'; rm -rf /" sh "$ROOT/deploy/backup-portal-db.sh" || code=$?
[ "$code" -eq 2 ]
