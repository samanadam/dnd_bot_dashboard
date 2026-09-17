#!/bin/sh
# Update the portal: pull code and image, recreate the container, wait until it
# is healthy, and roll back to the previous image when it does not get there.
#   cd /opt/dnd-bot-dashboard && sh deploy/deploy.sh
# Exit 0 healthy, 1 rolled back, 2 rollback failed too.
set -eu
cd "$(dirname "$0")/.."
. ./deploy/lib/alert.sh

SERVICE="${SERVICE:-portal}"
CONTAINER="${CONTAINER:-dnd-portal}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
SLEEP="${SLEEP:-sleep}"

wait_healthy() {
  waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    [ "$status" = healthy ] && return 0
    [ "$status" = unhealthy ] && return 1
    "$SLEEP" 3
    waited=$((waited + 3))
  done
  return 1
}

previous=$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null || true)

git pull --ff-only
docker compose pull "$SERVICE"
docker compose up -d "$SERVICE"

if wait_healthy; then
  echo "deploy: $CONTAINER healthy"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "deploy: $CONTAINER not healthy, rolling back" >&2
if [ -z "$previous" ]; then
  alert "Portal deploy failed and there is no previous image to roll back to."
  exit 2
fi
docker tag "$previous" dnd-portal:rollback
PORTAL_IMAGE=dnd-portal:rollback docker compose up -d "$SERVICE"
if wait_healthy; then
  alert "Portal deploy failed health checks; rolled back to the previous image."
  exit 1
fi
alert "Portal deploy failed and the rollback is not healthy either. Needs attention."
exit 2
