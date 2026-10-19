# Plano executável — fase 03

## Step Implementations
- SI-03.0: portar instruções/workflow/MCP para Codex; artefatos research→context→validate→resolve→build. Evidência: AGENTS.md e .codex/config.toml.
- SI-03.1: entidade/repository/migration e política de upload. Unit: limites/partes/ETags; integração: FK, uniqueness e transições.
- SI-03.2: adapter S3 e API privada multipart. Unit: dono, tamanho, transições; integração: multipart real e abort.
- SI-03.3: dispatcher/outbox, BullMQ e worker FFmpeg. Unit: falha/retry/idempotência; integração: job real, metadados e thumbnail.
- SI-03.4: metadata pública e redirect stream/download/thumbnail. Unit: ready gate; e2e: Range 206 e attachment.
- SI-03.5: Compose, testes reais e documentação. Executar suíte unit+integração+e2e completa, tsc e lint dentro de containers. Não marcar concluído sem todos passarem.

## Technical Specifications
### Data Model
videos: id UUID PK, channel_id UUID FK channels ON DELETE CASCADE, slug UUID UNIQUE, title varchar(160), filename varchar(180), content_type varchar(80), byte_size bigint (1..10000000000), status varchar(16) com CHECK draft/processing/ready/failed, source_key text UNIQUE, upload_id nullable text (interno), playback_key/thumbnail_key nullable text, duration_seconds double precision, metadata JSONB selecionado, error_code nullable varchar(80), queued_at nullable timestamptz, created_at/updated_at timestamp. Atualizações de conclusão com bloqueio de linha; processamento publica estado somente ao terminar.

### API Contracts
| Método | Caminho | Corpo/resultado | Status |
|---|---|---|---|
| POST | /videos/uploads | title, filename, contentType, byteSize → id/slug/partSize/partCount | 201 |
| POST | /videos/:id/upload-parts | partNumbers[1..100] → [{partNumber,url}] renováveis | 200 |
| POST | /videos/:id/complete | parts[{partNumber,etag}] → id/status | 202 |
| DELETE | /videos/:id/upload | aborta upload draft, remove rascunho | 204 |
| GET | /videos/:id/status | status/erro seguro para dono | 200 |
| GET | /videos/:slug | metadata ready sem chaves | 200 |
| GET | /videos/:slug/stream | 307 URL S3 de MP4 (Range no storage) | 307 |
| GET | /videos/:slug/download | 307 URL S3 attachment do original | 307 |
| GET | /videos/:slug/thumbnail | 307 URL JPEG | 307 |

### Authorization Matrix
Upload/parts/complete/abort/status: JWT válido + canal do usuário proprietário. Metadata/stream/download/thumbnail: público apenas ready. IDs inválidos 400; não encontrado/não proprietário 404 para não revelar existência. Não aceitar canal/chave de storage do cliente.

### Error Catalog
VIDEO_NOT_FOUND 404; VIDEO_NOT_READY 409; INVALID_UPLOAD 422; INVALID_VIDEO_STATE 409; UPLOAD_MISMATCH 422. Erro terminal persistido PROCESSING_FAILED. Falhas transitórias de infra propagam 5xx sem dados sensíveis no DTO. Sem vídeo legível para ffprobe falha processamento.

### Events/Messages
Queue `video-processing`, job `process`, data `{videoId: uuid}`, jobId `video-<uuid>`, 3 attempts, exponential backoff 2000ms, concurrency 1. Publisher consulta processing/queued_at NULL; add idempotente e então marca queued_at. Worker lê estado atual; ready retorna; lança erros para retry; última tentativa grava failed. ID ausente é erro de job. Jobs concluídos mantidos para impedir duplicação.

### Dependency Map
SI-03.0 → SI-03.1 → SI-03.2 → SI-03.3 → SI-03.4 → SI-03.5. API depende DB/storage; worker depende DB/storage/queue e FFmpeg. MinIO initializer cria bucket privado antes dos serviços de aplicação; o servidor configura expiração de multipart incompleto em 24h e varredura a cada hora. CORS é global no servidor comunitário, por `S3_CORS_ALLOW_ORIGIN`.

### Deliverables
Artefatos da fase, AGENTS.md, adapter S3, módulo/repository/DTO/migration, worker, Compose, testes unit/integration/e2e, script de upload e verificação, README reproduzível, evidências reais em progress.md.
