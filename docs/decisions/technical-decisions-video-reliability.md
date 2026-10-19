---
scope_type: ad-hoc
scope_description: Corrigir reconciliação de falhas terminais de vídeo e demonstrar multipart real acima de 64 MiB.
related_phases: [3]
status: decided
---
# Research — recuperação do processamento de vídeos

Esta rodada corrige os achados V1–V3 da revisão final. A arquitetura da fase 03 permanece: multipart direto MinIO, PostgreSQL, BullMQ/Redis, worker separado e saída MP4.

## TD-03.6 — Estado terminal independente do evento local

Capability: ciclo de status do vídeo refletido no banco, inclusive falha do worker.

Problema observado: o catch do processor não executa quando BullMQ encerra um job por excesso de stalls. O evento `failed` só produz log. Um encerramento abrupto pode deixar `videos.status=processing` com `queued_at` preenchido para sempre.

Opções:

1. Atualizar o banco somente no evento `failed`: pequena alteração, mas perde a atualização se o processo morrer ou o banco recusar a escrita nesse momento.
2. Consumir QueueEvents com checkpoint: entrega mais durável, mas adiciona gestão de offsets/retenção e ainda requer reconciliação se o evento for perdido.
3. Reconciliar vídeos `processing` com o estado real do job, no startup e periodicamente: a linha PostgreSQL permite retomar após restart; requer leitura limitada/paginada da fila e updates condicionais.

Escolha: opção 3, com evento local apenas como aceleração. O consumidor BullMQ fica separado do serviço de publicação/reconciliação. Estados terminais `failed` (incluindo stalls) e `completed` sem resultado persistido encerram condicionalmente um vídeo ainda `processing` como `failed`; nunca sobrescrever `ready`. Job ausente é republicado com o mesmo ID, também recuperando perda da fila. Estado ativo/waiting/delayed mantém `processing`. Paginação por UUID evita que os primeiros jobs longos impeçam verificar os demais. Jobs terminais continuam retidos como evidência durável até a política operacional de retenção ser definida.

O processor propaga erros; a fonte da decisão de falha terminal será o estado confirmado da fila, não um cálculo antecipado de `attemptsMade`. Logs não expõem o motivo bruto ao usuário; `PROCESSING_FAILED` continua sendo o código público.

## TD-03.7 — Evidência de volume e interrupção

Capability: upload de até 10 GB sem transportar bytes pela API e processamento assíncrono real.

Teste de interrupção: PostgreSQL e Redis reais, subprocessos BullMQ mortos com SIGKILL, relógios de lease reduzidos somente no teste. Confirmar que o job falha por stall sem executar novamente a função de processamento; iniciar o reconciliador posteriormente e verificar erro persistido. Simular uma escrita temporariamente recusada para provar recuperação sem depender de novo evento.

Teste multipart: vídeo sintético válido maior que 64 MiB, duas partes reais, comparação dos bytes baixados por streaming e verificação dos metadados/thumbnail/Range. Um teste físico de 10 GB será tratado separadamente, com capacidade de disco e coordenação do ambiente, sem inferir que o teste de fronteira anterior transferiu esse volume.

## Documentação de bibliotecas nesta rodada

A consulta Context7 foi realizada pelo orquestrador em 19/10/2026 às 21:56 UTC, antes das alterações dependentes desta rodada. Resultados e diferenças de versão estão em `docs/tasks/task-video-reliability/library-refs.md`. O uso de web na implementação original permanece registrado como limitação histórica; não é apresentado como consulta Context7 anterior.
