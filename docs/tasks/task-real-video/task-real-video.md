# Plano de implementação e aceite

## SI-01 — Mídia real reproduzível

Criar preparador e inspector com download SHA-256, MOV/DNxHD/PCM, limite natural, soma dos pacotes, mapa de atoms e decode integral. Piloto reduzido valida as ferramentas; não conta como teste de 10 GB.

## SI-02 — Caminho público e worker

Adicionar entrada por arquivo ao smoke, leitura limitada por parte, hash no upload/download, espera configurável, reprodução integral, frames/duração, codecs, faststart, ranges e responsividade. Manter o cenário sintético anterior separado e explicitamente descrito.

## SI-03 — Execução, correções e publicação

CI isolado com espaço suficiente, toda suíte unitária/integração/e2e, tsc/format/lint e ambos os cenários físicos. Preservar evidências pequenas e atribuição. Revisar correções, executar novamente somente se houver falha ou alteração relevante. Publicar pela feature → dev → main após CI aprovado. Não submeter à avaliação.
