#!/bin/sh
# Daily off-site copy of the portal database (DM data). The snapshot is taken
# inside the portal container with VACUUM INTO, which is consistent while the
# portal runs, then streamed into the bot container, which already holds the R2
# credentials. Nothing secret is stored on the host.
#   sh deploy/backup-portal-db.sh
set -eu
. "$(dirname "$0")/lib/alert.sh"

TODAY="${TODAY:-$(date -u +%F)}"
case "$TODAY" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) echo "bad TODAY" >&2; exit 2 ;;
esac
SNAP="/app/data/backup-$TODAY.db"

fail() {
  alert "Portal database backup failed: $1."
  exit 1
}
cleanup() {
  docker exec dnd-portal rm -f "$SNAP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# No database yet (DM tools never used): nothing to back up.
if ! docker exec dnd-portal test -f /app/data/portal.db; then
  echo "backup: no portal database yet"
  exit 0
fi

docker exec dnd-portal node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/app/data/portal.db');
  db.exec(\"VACUUM INTO '$SNAP'\");
  db.close();
" 2>/dev/null || fail "snapshot"

# The upload script travels as an argument so stdin carries only the database.
UPLOAD_PY=$(cat <<'PY'
import datetime, io, sys
from dnd_bot.config import load_config
from dnd_bot.r2 import R2Store

today = sys.argv[1]
data = sys.stdin.buffer.read()
if not data.startswith(b"SQLite format 3\x00"):
    raise SystemExit("not a sqlite file")
store = R2Store.from_config(load_config())
prefix = "backups/portal/"
store.client.upload_fileobj(io.BytesIO(data), store.bucket, f"{prefix}portal-{today}.db")
print(f"uploaded portal-{today}.db ({len(data)} bytes)")
cutoff = (datetime.date.fromisoformat(today) - datetime.timedelta(days=30)).isoformat()
for key in store.list_keys(prefix):
    stamp = key[len(prefix) + len("portal-"):][:10]
    if stamp < cutoff:
        store.client.delete_object(Bucket=store.bucket, Key=key)
        print(f"pruned {key[len(prefix):]}")
PY
)

docker exec dnd-portal cat "$SNAP" | docker exec -i dnd-bot python -c "$UPLOAD_PY" "$TODAY" || fail "upload"
