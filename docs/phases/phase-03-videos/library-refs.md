# Referências de bibliotecas

| Biblioteca | Linha de versão | Uso | Fonte oficial |
|---|---|---|---|
| NestJS | 11 (base) | DI/controllers/worker application context | https://docs.nestjs.com/standalone-applications |
| TypeORM | 0.3 (base) | Repository, migration, transaction/pessimistic_write | https://typeorm.io/docs/advanced-topics/transactions/ |
| AWS SDK client-s3 + s3-request-presigner | 3 (versões exatas em package.json/lock) | multipart, ListParts, Head/Get/Put, URLs | https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html |
| BullMQ | 6.3.16 (versão exata em package.json/lock) | Queue, Worker, retries e jobId | https://docs.bullmq.io/guide/retrying-failing-jobs |
| Redis | 7.4 | backend durável da fila | https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ |
| FFmpeg/ffprobe | pacote Debian bookworm da imagem, registrar versão no teste | transcode/metadata/thumbnail | https://ffmpeg.org/ffmpeg.html |
| MinIO | RELEASE.2025-10-15T17-29-55Z, build a partir do código oficial | storage S3 local | https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z |
| MinIO Client | RELEASE.2025-08-13T08-35-41Z, build a partir do código oficial | inicialização de bucket e lifecycle | https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z |

Consulta oficial via web; Context7 indisponível nesta sessão. Nenhum wrapper FFmpeg extra. As versões npm exatas resolvidas são a fonte canônica; não confiar em versões inventadas nesta tabela.

Em 19/10/2026, o [README oficial do MinIO](https://github.com/minio/minio#source-only-distribution) informa distribuição comunitária somente por código-fonte e repositório arquivado. O pull da antiga imagem pública falhou. `infra/Dockerfile.minio` compila servidor e cliente de releases fixos, conforme orientação oficial; nenhuma imagem de terceiros substitui o servidor requerido. Este ambiente educacional não pressupõe manutenção de segurança futura do upstream arquivado.

CORS comunitário é configurado globalmente por `MINIO_API_CORS_ALLOW_ORIGIN`, conforme [documentação de configuração](https://github.com/minio/minio/blob/master/docs/config/README.md) e [esclarecimento dos mantenedores](https://github.com/minio/minio/discussions/20841). `mc cors set` por bucket exige outra edição e não faz parte da inicialização.

O teste real de inicialização revelou que `AbortIncompleteMultipartUpload` não é aceito no lifecycle desta versão comunitária, confirmado no [parser oficial](https://github.com/minio/minio/blob/RELEASE.2025-10-15T17-29-55Z/internal/bucket/lifecycle/rule.go). A limpeza usa `MINIO_API_STALE_UPLOADS_EXPIRY=24h` e `MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL=1h`, opções presentes no [código oficial de configuração](https://github.com/minio/minio/blob/RELEASE.2025-10-15T17-29-55Z/internal/config/api/api.go). Não há regra que expire vídeos concluídos.
