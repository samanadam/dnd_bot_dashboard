# Sourced by the ops scripts. Posts a short message to a Discord webhook whose
# URL lives only on the server (root-only file), never in the repo.
#   . deploy/lib/alert.sh; alert "text"

alert() {
  file="${ALERT_WEBHOOK_FILE:-/etc/dnd-ops/alert-webhook}"
  [ -r "$file" ] || return 0
  url=$(head -n 1 "$file" | tr -d '\r')
  case "$url" in
    https://discord.com/api/webhooks/* | https://discord.invalid/*) ;;
    *) return 0 ;;
  esac
  text=$(printf '[%s] %s' "$(hostname)" "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g' | cut -c1-1800)
  printf '{"content":"%s","allowed_mentions":{"parse":[]}}' "$text" |
    curl -fsS -m 10 -H 'Content-Type: application/json' --data-binary @- "$url" >/dev/null 2>&1 || true
}
