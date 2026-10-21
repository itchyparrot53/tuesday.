#!/usr/bin/env bash
# Throwaway restore drill. Only tuesday-smoke* resources are touched.
set -euo pipefail

IMAGE="${IMAGE:-tuesday:latest}"
SRC_NAME="tuesday-smoke-drill"
SRC_VOLUME="tuesday-smoke-drill-data"
DST_NAME="tuesday-smoke-restore"
DST_VOLUME="tuesday-smoke-restore"
SRC_PORT=3298
DST_PORT=3297
SRC_COOKIES="/tmp/tuesday-smoke-drill-cookies"
DST_COOKIES="/tmp/tuesday-smoke-restore-cookies"
BACKUP_FILE="/tmp/tuesday-smoke-restore.tar.gz"
BOARD_ID=""

cleanup() {
  docker rm -f "$SRC_NAME" "$DST_NAME" >/dev/null 2>&1 || true
  docker volume rm "$SRC_VOLUME" "$DST_VOLUME" >/dev/null 2>&1 || true
  rm -f "$SRC_COOKIES" "$DST_COOKIES" "$BACKUP_FILE"
}
trap cleanup EXIT

wait_healthy() {
  local name="$1"
  for _ in $(seq 1 45); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || true)" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  echo "FAIL: $name did not become healthy"
  docker logs --tail 30 "$name" 2>&1 || true
  return 1
}

echo "[1/9] start source tuesday-smoke-drill"
docker rm -f "$SRC_NAME" >/dev/null 2>&1 || true
docker volume rm "$SRC_VOLUME" >/dev/null 2>&1 || true
docker run -d --name "$SRC_NAME" -p "$SRC_PORT:3000" -v "$SRC_VOLUME:/data" \
  -e AI_FAKE=true -e MAIL_FAKE=true -e PUSH_FAKE=true -e BACKUP_S3_FAKE=true \
  -e APP_URL="http://localhost:$SRC_PORT" "$IMAGE" >/dev/null
wait_healthy "$SRC_NAME"

echo "[2/9] create org, board and item"
curl -fsS -X POST "http://localhost:$SRC_PORT/api/auth/setup" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' \
  -d '{"orgName":"Restore Drill","name":"Drill Owner","email":"drill@example.com","password":"password123"}' \
  -c "$SRC_COOKIES" >/dev/null
WS=$(curl -fsS -X POST "http://localhost:$SRC_PORT/api/workspaces" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' -b "$SRC_COOKIES" \
  -d '{"name":"Drill space"}')
WS_ID=$(printf '%s' "$WS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).workspace.id))")
BOARD=$(curl -fsS -X POST "http://localhost:$SRC_PORT/api/boards" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' -b "$SRC_COOKIES" \
  -d "{\"workspaceId\":$WS_ID,\"name\":\"Drill board\"}")
BOARD_ID=$(printf '%s' "$BOARD" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).board.id))")
GROUP_ID=$(printf '%s' "$BOARD" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).groups[0].id))")
curl -fsS -X POST "http://localhost:$SRC_PORT/api/boards/$BOARD_ID/items" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' -b "$SRC_COOKIES" \
  -d "{\"groupId\":$GROUP_ID,\"name\":\"Restore drill item\"}" >/dev/null

echo "[3/9] create and download a backup"
BACKUP=$(curl -fsS -X POST "http://localhost:$SRC_PORT/api/admin/backups" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' -b "$SRC_COOKIES" -d '{}')
BACKUP_NAME=$(printf '%s' "$BACKUP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).backup.name))")
curl -fsS "http://localhost:$SRC_PORT/api/admin/backups/$BACKUP_NAME" \
  -H 'x-requested-with: tuesday' -b "$SRC_COOKIES" -o "$BACKUP_FILE"
test -s "$BACKUP_FILE"

echo "[4/9] start fresh restore target tuesday-smoke-restore"
docker rm -f "$DST_NAME" >/dev/null 2>&1 || true
docker volume rm "$DST_VOLUME" >/dev/null 2>&1 || true
docker run -d --name "$DST_NAME" -p "$DST_PORT:3000" -v "$DST_VOLUME:/data" \
  -e AI_FAKE=true -e MAIL_FAKE=true -e PUSH_FAKE=true -e BACKUP_S3_FAKE=true \
  -e APP_URL="http://localhost:$DST_PORT" "$IMAGE" >/dev/null
wait_healthy "$DST_NAME"

echo "[5/9] create a temporary owner on the target"
curl -fsS -X POST "http://localhost:$DST_PORT/api/auth/setup" \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' \
  -d '{"orgName":"Restore Target","name":"Target Owner","email":"target@example.com","password":"password123"}' \
  -c "$DST_COOKIES" >/dev/null

echo "[6/9] upload the backup and let the target restart"
curl -fsS -X POST "http://localhost:$DST_PORT/api/admin/restore" \
  -H 'x-requested-with: tuesday' -b "$DST_COOKIES" -F "file=@$BACKUP_FILE" >/dev/null || true
for _ in $(seq 1 30); do
  RUNNING=$(docker inspect -f '{{.State.Running}}' "$DST_NAME" 2>/dev/null || echo false)
  [ "$RUNNING" = false ] && break
  sleep 1
done
docker start "$DST_NAME" >/dev/null
wait_healthy "$DST_NAME"

echo "[7/9] verify the restored item with the source account"
ITEMS=$(curl -fsS "http://localhost:$DST_PORT/api/boards/$BOARD_ID/items" -b "$SRC_COOKIES")
printf '%s' "$ITEMS" | grep -q 'Restore drill item'

echo "[8/9] verify the target is serving the restored org"
curl -fsS "http://localhost:$DST_PORT/api/auth/me" -b "$SRC_COOKIES" | grep -q 'Drill Owner'

echo "[9/9] cleanup runs on exit"
echo "RESTORE DRILL PASS"
