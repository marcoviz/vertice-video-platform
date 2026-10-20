#!/bin/sh
# Called after the isolated Compose services are healthy. No application secrets
# or film bytes are published: only measurements and license attribution.
set -eu
cd "$(dirname "$0")/.."
fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/vertice-real-video.XXXXXX")
evidence_dir=${REAL_VIDEO_EVIDENCE_DIR:-"$PWD/../validation-logs/real-video"}
mkdir -p "$evidence_dir"
chmod 777 "$fixture_dir"
stats_pid=
cleanup_real() {
  if [ -n "$stats_pid" ]; then
    kill "$stats_pid" 2>/dev/null || true
    wait "$stats_pid" 2>/dev/null || true
  fi
  # Keep small diagnostics even on failure, then delete only this run's fixture.
  for name in input-evidence.json result.json; do
    if [ -f "$fixture_dir/$name" ]; then cp "$fixture_dir/$name" "$evidence_dir/$name"; fi
  done
  if [ -f "$evidence_dir/resources.log" ]; then cat "$evidence_dir/resources.log"; fi
  rm -rf "$fixture_dir"
}
trap cleanup_real EXIT INT TERM
available_bytes=$(docker compose run --rm --no-deps --entrypoint sh nestjs-api -c "df -Pk /tmp | awk 'NR == 2 {printf \"%.0f\\n\", \$4 * 1024}'")
host_available_bytes=$(df -Pk "$fixture_dir" | awk 'NR == 2 {printf "%.0f\n", $4 * 1024}')
echo "RUN: real encoded video near 10 GB; Docker filesystem free=$available_bytes bytes"
if [ "$available_bytes" -lt 45000000000 ] || [ "$host_available_bytes" -lt 45000000000 ]; then
  echo 'FAIL: real video validation requires at least 45 GB free inside Docker' >&2
  exit 1
fi
docker compose run --rm --no-deps \
  -v "$fixture_dir:/fixtures" nestjs-api \
  python3 scripts/prepare-real-video.py /fixtures

api_id=$(docker compose ps -q nestjs-api)
worker_id=$(docker compose ps -q video-worker)
for id in "$api_id" "$worker_id"; do
  test "$(docker inspect -f '{{.State.OOMKilled}} {{.RestartCount}}' "$id")" = 'false 0'
done
(
  while :; do
    date -u '+REAL_RESOURCE_SAMPLE %Y-%m-%dT%H:%M:%SZ'
    docker stats --no-stream --format '{{.Name}} memory={{.MemUsage}} cpu={{.CPUPerc}} network={{.NetIO}}' "$api_id" "$worker_id" || true
    sleep 3
  done
) > "$evidence_dir/resources.log" 2>&1 &
stats_pid=$!
docker compose run --rm --no-deps \
  -v "$fixture_dir:/fixtures" \
  -e SMOKE_INPUT_FILE=/fixtures/tears-of-steel-dnxhd.mov \
  -e SMOKE_INPUT_EVIDENCE=/fixtures/input-evidence.json \
  -e SMOKE_REPORT_FILE=/fixtures/result.json \
  -e SMOKE_TIMEOUT_MS=14400000 \
  nestjs-api node scripts/smoke-worker.mjs
for id in "$api_id" "$worker_id"; do
  state=$(docker inspect -f '{{.State.OOMKilled}} {{.RestartCount}}' "$id")
  echo "REAL_CONTAINER_STATE $id $state" | tee -a "$evidence_dir/container-state.txt"
  test "$state" = 'false 0'
done
echo 'PASS: real encoded video, complete decoding, original hash, playback and API responsiveness'
