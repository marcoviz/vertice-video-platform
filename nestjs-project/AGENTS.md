# Backend

Leia `CLAUDE.md` deste diretório e do repositório, mais `.claude/rules/nestjs-*.md`, `typeorm-*.md` e `typescript-strict.md` aplicáveis. Os comandos de DoD devem rodar via Docker Compose. Validação diagnóstica local autorizada pelo orquestrador não substitui o DoD.

Vídeos: módulos em `src/videos/`; schema em migration `1792400000000-CreateVideos.ts`; worker em `src/video-worker.ts`. A API nunca recebe bytes de vídeo: URLs multipart são assinadas para MinIO. O worker usa disco temporário, limites de concorrência e FFmpeg por argv sem shell. Bucket privado. Apenas vídeos ready são públicos. As chaves de storage e upload IDs nunca são retornadas na leitura pública.

Serviços Compose: nestjs-api, db, mailpit, storage, storage-init, queue, video-worker, migrate. Testes via `scripts/verify-compose.sh`; precisam Postgres, MinIO, Redis e FFmpeg reais. Não executar testes integrados na base de produção.
