# Validação — confiabilidade de vídeos

Revisão anterior ao código desta rodada.

- O requisito e a causa do bug são rastreáveis ao enunciado, ao código e à versão BullMQ instalada.
- A reconciliação precisa lidar com evento perdido, reinício, falha temporária no banco, jobs ausentes e escrita condicional para não sobrescrever `ready`.
- A consulta paginada deve alcançar vídeos além do primeiro lote.
- O teste de crash deve usar processo separado e serviços reais; mocks de callback não demonstram o caso.
- O teste de multipart precisa transferir mais de uma parte real; o limite de 10 GB em DTO não é evidência de volume físico.
- Sem mudança de schema ou de contrato HTTP nesta proposta.
- Resolvido: consulta real Context7 de BullMQ/TypeORM/AWS SDK em 19/10/2026, 21:56 UTC, anterior à implementação desta rodada; resultados em library-refs.md. A versão BullMQ retornada (6.3.11) foi confrontada com código e declarações instalados (6.3.16): maxStalledCount, deferredFailure, getJobState e jobId têm a semântica necessária. TypeORM: usar somente update de dois argumentos, MoreThan/order/take presentes em 0.3.31; não copiar overload novo de RETURNING da documentação master.

status: clean
