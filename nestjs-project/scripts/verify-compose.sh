#!/bin/sh
# Isolated disposable project: does not touch the normal dev volumes.
set -eu
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=vertice-video-check
[ -f .env ] || cp .env.example .env
stats_pid=
cleanup() {
  if [ -n "$stats_pid" ]; then kill "$stats_pid" 2>/dev/null || true; fi
  docker compose logs --no-color --tail 80 nestjs-api video-worker 2>/dev/null || true
  docker compose down -v --remove-orphans
}
trap cleanup EXIT INT TERM
docker compose build
docker compose up -d --wait db mailpit queue storage
docker compose run --rm --no-deps storage-init
docker compose run --rm --no-deps nestjs-api npm run migration:run
# Tests instantiate their own Nest HTTP application and isolated worker lifecycle.
docker compose run --rm --no-deps nestjs-api npm test -- --runInBand
docker compose run --rm --no-deps nestjs-api npm run migration:run
docker compose run --rm --no-deps nestjs-api npm run test:e2e -- --runInBand
docker compose run --rm --no-deps nestjs-api npx tsc --noEmit
docker compose run --rm --no-deps nestjs-api npx prettier --check 'src/videos/**/*.{ts,cjs}' test/videos.e2e-spec.ts scripts/smoke-worker.mjs
# Do not auto-fix ephemeral container files and mistake that for clean sources.
docker compose run --rm --no-deps nestjs-api npx eslint '{src,apps,libs,test}/**/*.ts'
# Exercise the actual production entrypoints as two independent processes too.
docker compose up -d --wait nestjs-api video-worker
docker compose run --rm --no-deps -e SMOKE_VIDEO_BYTES="${SMOKE_VIDEO_BYTES:-67109888}" nestjs-api node scripts/smoke-worker.mjs
# Opt-in extended CI check. Measure the actual Docker filesystem after the
# image build and normal suite, then require more than 25 GB still available.
if [ "${VERIFY_10GB_IF_SPACE:-0}" = 1 ]; then
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  available_bytes=$(df -PB1 "$docker_root" | awk 'NR == 2 {print $4}')
  if [ "$available_bytes" -gt 25000000000 ]; then
    echo "RUN: physical 10 GB smoke; Docker filesystem free=$available_bytes bytes"
    (
      while :; do
        date -u '+RESOURCE_SAMPLE %Y-%m-%dT%H:%M:%SZ'
        docker stats --no-stream --format '{{.Name}} memory={{.MemUsage}} cpu={{.CPUPerc}} network={{.NetIO}}' vertice-video-check-nestjs-api-1 vertice-video-check-video-worker-1 || true
        sleep 2
      done
    ) &
    stats_pid=$!
    docker compose run --rm --no-deps -e SMOKE_VIDEO_BYTES=10000000000 nestjs-api node scripts/smoke-worker.mjs
    kill "$stats_pid" 2>/dev/null || true
    wait "$stats_pid" 2>/dev/null || true
    stats_pid=
    echo 'PASS: extended physical 10 GB smoke completed'
  else
    echo "SKIP: physical 10 GB smoke; Docker filesystem free=$available_bytes bytes, requires >25000000000"
  fi
fi
docker compose ps
docker compose run --rm --no-deps nestjs-api ffmpeg -version
