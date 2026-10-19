# Plano executável — confiabilidade de vídeos

## Step Implementations

### SI-1 — Reconciliação durável

- Separar consumo do worker de publicação/reconciliação, preservando container e injeção NestJS.
- Consultar vídeos processing em lotes de 50 por cursor UUID, sem depender de queued_at NULL.
- Confrontar getJobState: unknown republica ID determinístico; failed/completed encerram apenas linha ainda processing; estados não terminais preservam status.
- Tirar do processor a decisão antecipada de erro terminal; preservar propagação de erro e cleanup.
- Testar banco real (paginação/update condicional) e fila real (crash de subprocessos, evento perdido, falha de escrita/restart, republicação sem duplicação).

### SI-2 — Multipart físico e fechamento

- Ampliar smoke de API + worker separados para MP4 válido acima de 64 MiB, duas partes reais e SHA-256 do download.
- Permitir tamanho configurável até 10 GB sem buffer integral nem arquivo de origem desse tamanho: gerar padding MP4 em partes na memória limitada do cliente.
- Executar suíte completa unit/integração/e2e, tsc e lint em Docker; revisar README/AGENTS/CLAUDE e registrar evidências reais.

## Technical Specifications

Data Model: sem novas colunas. videos.status/queued_at existentes; UPDATE WHERE id AND status='processing'. Cursor usa UUID estável e ordenação ASC.

API Contracts e Authorization Matrix: inalterados, conforme plano da fase 03. Nenhuma nova rota pública.

Error Catalog: PROCESSING_FAILED continua código terminal seguro. Motivo bruto de Redis/FFmpeg não é retornado ao cliente.

Events/Messages: mesmo queue/jobId/data e três tentativas normais. Evento failed é sinal de reconciliação, não confirmação por attemptsMade. Reconciliação automática no startup e a cada 2 s; lote de 50 por tick com retorno ao início no fim; uma falha de item é registrada e revisitada em ciclo posterior. Redis conserva jobs terminais.

Dependency Map: research → contexto → validação/resolve clean → SI-1 → SI-2. Docker isolado precisa estar disponível antes dos testes. Execução contínua autorizada nesta sessão.

Deliverables: código, testes significativos, smoke parametrizado, documentação honesta sobre Context7 e volume, DoD em containers. Commits/merge/push serão feitos pelo orquestrador após revisão.
