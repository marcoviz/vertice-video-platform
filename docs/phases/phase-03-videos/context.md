# Contexto — fase 03

Fonte de requisitos: desafio Continuando o StreamTube com IA — Fase 03 e `docs/project-plan.md`. Base local preservada em separado. Escopo backend, sem UI de vídeo.

Existente: NestJS 11, PostgreSQL 17/TypeORM 0.3, JWT global com opt-out @Public, ValidationPipe, filtro DomainException, canal 1:1 criado no cadastro, migrations e testes. Nova entidade usa canal como FK e reusa autenticação.

Entradas: título, nome/mime/tamanho do arquivo, partes com números/ETags. Saídas: rascunho com URLs multipart, status do proprietário, metadados públicos ready, redirect de stream/download/thumbnail. Somente proprietário inicia/conclui/cancela; nenhum ID de canal recebido do cliente.

Dependências fechadas em TD-03.1–5: MinIO S3, BullMQ/Redis, FFmpeg/ffprobe em worker separado. Nenhum arquivo de 10GB atravessa memória da API; worker usa streaming para disco.

Restrições no planejamento inicial: Docker ausente no ambiente de autoria, Context7 não disponível na sessão. Documentação consultada via web oficial. Docker foi habilitado durante a execução; os resultados reais e o estado do DoD estão em `progress.md`. Context7 permanece registrado como fallback documental.

Rastreabilidade: upload/draft → SI-03.1/2; storage/fila/worker → SI-03.2/3/5; duração/thumbnail/status → SI-03.3; URL/stream/download → SI-03.4; testes/DoD → SI-03.5; portabilidade Codex → SI-03.0.
