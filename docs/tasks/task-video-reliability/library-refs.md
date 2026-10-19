# Referências — rodada de confiabilidade

Consulta real ao servidor MCP `https://mcp.context7.com/mcp`, executada pelo orquestrador em 19/10/2026, 21:56:40 UTC, antes de implementar as correções desta rodada. Foram executados initialize, tools/list, resolve-library-id e query-docs. Os retornos completos foram preservados na área da tarefa em `work/fixes-final/context7-{initialize,tools-list,resolve-*,docs-*}`. Nenhuma chave de API foi necessária.

| Biblioteca instalada | ID consultado | Resultado aplicado |
|---|---|---|
| BullMQ 6.3.16 | `/taskforcesh/bullmq/v6.3.11` | Stalls acima de maxStalledCount (padrão 1) produzem falha permanente; UnrecoverableError dispensa esgotar attempts. Conferir estado real, não contar tentativas. |
| TypeORM 0.3.31 | `/typeorm/typeorm` | Update com predicado de status e paginação por MoreThan + order/take. |
| AWS S3 SDK/presigner 3.1152.0 | `/aws/aws-sdk-js-v3` | Partes limitadas, ETags preservados na conclusão; partes intermediárias >=5 MiB, última menor permitida. |

Diferença de versão explicitamente revisada: Context7 retornou BullMQ 6.3.11 e alguns trechos master. O código instalado 6.3.16 em `classes/worker.js` confirma deferredFailure antes do processor, o script `moveStalledJobsToWait-9.js` confirma a falha por excesso de stalls, e `classes/queue-getters.d.ts` declara getJobState como `JobState | 'unknown'`. O update usado tem dois argumentos, compatível com TypeORM 0.3.31; não usamos o novo overload de RETURNING exibido nos trechos master. O package.json permite TypeORM ^0.3.28, mas pnpm-lock.yaml e node_modules confirmam a versão resolvida 0.3.31. Não há nova dependência.

Fontes oficiais devolvidas pelo MCP: [stalled jobs](https://github.com/taskforcesh/bullmq/blob/v6.3.11/docs/gitbook/guide/jobs/stalled.md), [Repository API](https://github.com/typeorm/typeorm/blob/master/docs/docs/working-with-entity-manager/6-repository-api.md), [find options](https://github.com/typeorm/typeorm/blob/master/docs/docs/working-with-entity-manager/3-find-options.md), [upload multipart AWS](https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/src/Upload.ts).

Essa consulta pertence à revisão de confiabilidade. A implementação original da fase 03 usou documentação oficial via web quando Context7 não estava exposto; a limitação histórica permanece registrada.
