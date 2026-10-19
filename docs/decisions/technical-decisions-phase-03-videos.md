---
phase: phase-03-videos
status: decided
---
# Decisões técnicas — fase 03

Pesquisa realizada antes da implementação, a partir do enunciado e da arquitetura da base. Não foram lidas soluções de outros alunos.

## TD-03.1 — Fila
Capability: processamento automático após upload.
Opções: RabbitMQ (roteamento e confirmações explícitas, mais código para retries); BullMQ sobre Redis (jobs, backoff, concorrência e retries integrados em TypeScript); polling de banco sem broker (simples, mas não atende à fila real separada).
Escolha: BullMQ 6 e Redis 7.4 com AOF e noeviction. O worker publica jobs a partir de linhas processing ainda não despachadas; jobId usa o UUID do vídeo. O campo queued_at é o marcador de outbox. Crash entre add e marcação repete add com mesmo ID, sem duplicação. Não excluir automaticamente jobs concluídos/falhos. Três tentativas com backoff; status failed apenas após a última. Redis exige volume persistente e monitoramento; perda desse volume requer reconciliação operacional.

## TD-03.2 — Upload
Capability: até 10GB sem travar, pré-cadastro rascunho.
Opções: proxy pela API (consome banda/conexões da API); URL PUT simples (limite de 5GB S3); multipart direto (retomada por parte, arquivos grandes).
Escolha: multipart pré-assinado no bucket privado. Limite decimal 10.000.000.000 bytes, partes de 64MiB e última parte menor; assinatura por parte com comprimento exato. API grava draft antes de iniciar storage, verifica ETags e tamanhos reais antes de concluir. Falhas preservam draft para retry. Cancelamento explícito e limpeza nativa do MinIO para uploads incompletos após 24h, varredura a cada hora. Para S3 AWS, configurar AbortIncompleteMultipartUpload equivalente no bucket; essa regra S3 não é suportada pelo lifecycle do MinIO comunitário fixado. URLs expiram em 15 minutos e podem ser renovadas. A API processa somente JSON pequeno.

## TD-03.3 — Processamento
Capability: duração, metadados e thumbnail.
Opções: ffprobe/FFmpeg por CLI (maduro, processo isolado); wrapper fluent-ffmpeg (abstração extra, projeto arquivado); processamento na API (bloqueia capacidade).
Escolha: executáveis FFmpeg/ffprobe por spawn/execFile sem shell em container dedicado. Download em stream para disco temporário; protocolos file/pipe e formatos MOV/MP4/Matroska/WebM permitidos, sem playlists remotas; prova de stream de vídeo, duração positiva; transcodificação H.264/AAC MP4 com faststart para reprodução uniforme; thumbnail JPEG no primeiro frame. Uma execução por worker, timeout de 4 horas, limpeza de disco em finally. Reservar ao menos 30GB livres por worker para 10GB de entrada e saída. Apenas durações/codecs/dimensões selecionados são persistidos, sem metadados arbitrários.

## TD-03.4 — URLs e acesso
Capability: URL única, streaming e download.
Opções: nome/título (colisões), UUID v4 com índice UNIQUE (estável), proxy de mídia (custo de API), redirect assinado (storage atende Range nativamente).
Escolha: UUID v4 imutável no slug, constraint única no Postgres; URL /videos/{slug}. Leitura somente ready pública, draft/status restrito ao dono. GET stream redireciona 307 para MP4 privado com URL de curta duração; cliente preserva Range, storage devolve 206. Download original via Content-Disposition attachment, thumbnail via URL assinada.

## TD-03.5 — Consistência e falhas
Capability: ciclo draft → processing → ready/failed.
Completar upload segura bloqueio pessimista da linha; checa objeto já concluído para recuperação após queda entre S3 e DB. Apenas após HeadObject confirmar tamanho declarado muda para processing na transação. Worker é idempotente: ready é no-op, chaves de saída determinísticas, estado ready só após objetos gravados. Falha de processamento mantém processing durante retries; última falha grava código genérico sem expor infraestrutura. Uploads incompletos podem ser abortados pelo dono; drafts não são públicos.

## Fontes oficiais consultadas
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://docs.bullmq.io/guide/jobs/job-ids
- https://ffmpeg.org/ffmpeg.html
- https://ffmpeg.org/ffprobe.html

Context7 não está exposto nesta sessão; consulta via web oficial registrada como fallback, sem simular uso do MCP. A configuração equivalente foi fornecida em .codex/config.toml.
