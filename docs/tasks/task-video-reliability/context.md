# Contexto — confiabilidade de vídeos

Escopo autorizado: corrigir todas as pendências de vídeo apontadas na revisão, testar e atualizar documentação; commits/merges/push ficam com o orquestrador após revisão. Branch `feature/video-final-fixes`, criada a partir de `dev` após fast-forward de `dev` para a integração anterior já presente em `main`.

Origem: Fase 03 do enunciado, em especial ciclo de status/falhas, upload multipart direto e DoD em containers. Pesquisa: `docs/decisions/technical-decisions-video-reliability.md`, TD-03.6/03.7.

Diagnóstico anterior à revisão: `VideosRepository.pending()` buscava somente linhas nunca publicadas; `VideoQueueService` reunia publicação e consumo; `VideoProcessorService` marcava failed antecipadamente na última tentativa normal. O caminho de falha por stall de BullMQ 6.3.16 não chama o processor, deixando esse caso sem a transição terminal necessária.

Comportamento implementado nesta revisão: `processingBatch()` percorre vídeos processing em lotes de 50 por cursor UUID, incluindo linhas já publicadas. `VideoQueueService` publica e reconcilia o estado real dos jobs no início e a cada 2 segundos; `VideoQueueWorkerService` cuida do consumo. Jobs ausentes são republicados com ID estável, e jobs terminais encerram linhas ainda processing com `PROCESSING_FAILED`. Updates condicionais preservam resultados ready e jobs terminais ficam retidos no Redis para recuperação. O processor propaga erros e limpa temporários, sem decidir a falha terminal pela contagem de tentativas. Schema, contratos HTTP e frontend permanecem inalterados.

Testes anteriores à revisão: unitários de processor/upload, integração de repository/storage e e2e real com vídeo pequeno. Há registro anterior de 176 testes unit/integração e 56 e2e em Docker. Esses números não valem como resultados desta rodada; as evidências da revisão são registradas em [ci-validation.md](ci-validation.md).

Regras aplicadas: AGENTS/CLAUDE raiz e backend; regras NestJS, TypeORM e TypeScript; skills testing-guide-nestjs-project, nestjs-best-practices e typeorm. MinIO/Redis/Postgres reais prevalecem sobre exemplos antigos das skills que sugerem filesystem local ou fila TBD. Workflow manual research → context → validate → resolve → build → implement autorizado pelas instruções do projeto.

Limites e consultas: na implementação original, Context7 não estava exposto e foi usada documentação oficial via web; essa limitação histórica permanece registrada. Nesta rodada, o MCP Context7 foi consultado antes das alterações dependentes, e as diferenças para as versões instaladas foram conferidas em [library-refs.md](library-refs.md). Não executar serviços de produção nem usar credenciais externas. Testes isolados em Compose coordenados com o orquestrador.
