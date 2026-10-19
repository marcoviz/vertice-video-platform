#!/bin/sh
# Isolated disposable project: does not touch the normal dev volumes.
set -eu
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=vertice-video-check
[ -f .env ] || cp .env.example .env
cleanup() { docker compose down -v --remove-orphans; }
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
docker compose run --rm --no-deps nestjs-api npm run lint
# Exercise the actual production entrypoints as two independent processes too.
docker compose up -d --wait nestjs-api video-worker
docker compose run --rm --no-deps nestjs-api node scripts/smoke-worker.mjs
docker compose ps
docker compose run --rm --no-deps nestjs-api ffmpeg -version
