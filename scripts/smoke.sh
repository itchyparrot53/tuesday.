#!/usr/bin/env bash
# One-command Docker smoke test. Allowed resources: tuesday:smoke, tuesday-smoke, tuesday-smoke-data.
set -euo pipefail

cleanup() {
  docker rm -f tuesday-smoke >/dev/null 2>&1 || true
  docker volume rm tuesday-smoke-data >/dev/null 2>&1 || true
  docker rmi tuesday:smoke >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Local smoke token, injected into the container and reused by the authenticated checks.
HEALTH_TOKEN=smoke-token

echo "[1/9] docker build"
docker build -t tuesday:smoke . >/dev/null

echo "[2/9] start container"
docker volume rm tuesday-smoke-data >/dev/null 2>&1 || true
docker run -d --name tuesday-smoke -p 3299:3000 -v tuesday-smoke-data:/data \
  -e AI_FAKE=true -e MAIL_FAKE=true -e PUSH_FAKE=true -e BACKUP_S3_FAKE=true \
  -e HEALTH_TOKEN="$HEALTH_TOKEN" tuesday:smoke >/dev/null

echo "[3/9] wait for health"
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' tuesday-smoke 2>/dev/null || true)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' tuesday-smoke)" = healthy ]

echo "[4/9] set up owner"
curl -fsS -X POST http://localhost:3299/api/auth/setup \
  -H 'content-type: application/json' -H 'x-requested-with: tuesday' \
  -d '{"orgName":"Smoke","name":"Smoke Owner","email":"smoke@example.com","password":"password123"}' \
  -c /tmp/tuesday-smoke-cookies >/dev/null

echo "[5/9] create workspace, board and item"
WS=$(curl -fsS -X POST http://localhost:3299/api/workspaces -H 'content-type: application/json' \
  -H 'x-requested-with: tuesday' -b /tmp/tuesday-smoke-cookies -d '{"name":"Smoke space"}')
WS_ID=$(printf '%s' "$WS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).workspace.id))")
BOARD=$(curl -fsS -X POST http://localhost:3299/api/boards -H 'content-type: application/json' \
  -H 'x-requested-with: tuesday' -b /tmp/tuesday-smoke-cookies -d "{\"workspaceId\":$WS_ID,\"name\":\"Smoke board\"}")
BOARD_JSON="$BOARD"
BOARD_ID=$(printf '%s' "$BOARD" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).board.id))")
GROUP_ID=$(printf '%s' "$BOARD" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).groups[0].id))")
curl -fsS -X POST "http://localhost:3299/api/boards/$BOARD_ID/items" -H 'content-type: application/json' \
  -H 'x-requested-with: tuesday' -b /tmp/tuesday-smoke-cookies \
  -d "{\"groupId\":$GROUP_ID,\"name\":\"Smoke item\"}" >/dev/null

echo "[6/9] restart"
docker restart tuesday-smoke >/dev/null
sleep 8

echo "[7/9] item survives restart"
ITEMS=$(curl -fsS "http://localhost:3299/api/boards/$BOARD_ID/items" -b /tmp/tuesday-smoke-cookies)
printf '%s' "$ITEMS" | grep -q 'Smoke item'

echo "[8/9] deep health with token"
HEALTH=$(curl -fsS http://localhost:3299/api/health/deep -H "authorization: Bearer $HEALTH_TOKEN")
printf '%s' "$HEALTH" | grep -q '"ok":true'

echo "[9/9] metrics"
curl -fsS http://localhost:3299/api/metrics -H "authorization: Bearer $HEALTH_TOKEN" | grep -q 'tuesday_up 1'
rm -f /tmp/tuesday-smoke-cookies
echo "SMOKE OK"
