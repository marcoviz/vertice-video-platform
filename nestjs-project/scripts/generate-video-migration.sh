#!/bin/sh
set -eu
node scripts/generate-video-migration.cjs
node node_modules/typeorm/cli-ts-node-commonjs.js migration:generate src/database/migrations/CreateVideos -d src/database/data-source.ts -t 1792400000000 --pretty
node node_modules/prettier/bin/prettier.cjs --write src/database/migrations/1792400000000-CreateVideos.ts
node node_modules/typeorm/cli-ts-node-commonjs.js migration:run -d src/database/data-source.ts
node node_modules/typeorm/cli-ts-node-commonjs.js migration:generate /tmp/SchemaCheck -d src/database/data-source.ts --check
