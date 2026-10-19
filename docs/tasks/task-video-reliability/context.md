# Contexto — confiabilidade de vídeos

Escopo autorizado: corrigir todas as pendências de vídeo apontadas na revisão, testar e atualizar documentação; commits/merges/push ficam com o orquestrador após revisão. Branch `feature/video-final-fixes`, criada a partir de `dev` após fast-forward de `dev` para a integração anterior já presente em `main`.

Origem: Fase 03 do enunciado, em especial ciclo de status/falhas, upload multipart direto e DoD em containers. Pesquisa: `docs/decisions/technical-decisions-video-reliability.md`, TD-03.6/03.7.

Código atual: `VideosRepository.pending()` busca somente linhas nunca publicadas; `VideoQueueService` publica/consome; `VideoProcessorService` marca failed antecipadamente na última tentativa normal. O caminho de falha por stall de BullMQ 6.3.16 não chama o processor. Não há alteração de schema, contratos HTTP ou componentes de frontend planejada.

Testes existentes: unitários de processor/upload, integração de repository/storage e e2e real com vídeo pequeno. Há registro anterior de 176 testes unit/integração e 56 e2e em Docker. Esses números não valem como resultados desta rodada.

Regras aplicadas: AGENTS/CLAUDE raiz e backend; regras NestJS, TypeORM e TypeScript; skills testing-guide-nestjs-project, nestjs-best-practices e typeorm. MinIO/Redis/Postgres reais prevalecem sobre exemplos antigos das skills que sugerem filesystem local ou fila TBD. Workflow manual research → context → validate → resolve → build → implement autorizado pelas instruções do projeto.

Limites: Context7 original indisponível continua sendo fato histórico. Nesta rodada, implementação dependente aguarda consulta real. Não executar serviços de produção nem usar credenciais externas. Testes isolados em Compose coordenados com o orquestrador.
