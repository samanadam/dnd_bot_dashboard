#!/bin/sh
set -eux
cat > "$STUBS/curl" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
cat >> "$CALLS"
printf '\n' >> "$CALLS"
EOF
chmod +x "$STUBS/curl"
export PATH="$STUBS:$PATH"

# No webhook file: nothing sent, success.
ALERT_WEBHOOK_FILE="$WORK/missing" sh -c ". '$ROOT/deploy/lib/alert.sh'; alert hello"
[ ! -f "$CALLS" ]

# A URL that is not a Discord webhook is ignored.
printf 'https://attacker.example/x\n' > "$WORK/bad"
ALERT_WEBHOOK_FILE="$WORK/bad" sh -c ". '$ROOT/deploy/lib/alert.sh'; alert hello"
[ ! -f "$CALLS" ]

# With a webhook: one call, mentions disabled, quotes escaped.
printf 'https://discord.invalid/api/webhooks/1/x\n' > "$WORK/hook"
ALERT_WEBHOOK_FILE="$WORK/hook" sh -c ". '$ROOT/deploy/lib/alert.sh'; alert 'bot \"unhealthy\" @everyone'"
grep -q 'discord.invalid' "$CALLS"
grep -q '"allowed_mentions":{"parse":\[\]}' "$CALLS"
grep -q 'bot \\"unhealthy\\" @everyone' "$CALLS"
