# Teste com mídia audiovisual real próxima de 10 GB

Escopo: pedido de validação adicional da fase 03, autorizado em 19/10/2026. O teste anterior com atom `free` comprova o limite e I/O, mas não a decodificação de conteúdo audiovisual desse volume.

## TD-03.8 — Fonte e tamanho

Decisão: usar um trecho contínuo de **Tears of Steel**, Blender Foundation, CC BY 3.0, distribuído por Xiph. Baixar a fonte com checksum SHA-256 fixo e recodificar para MOV/DNxHD 185M e áudio PCM. Preservar proporção com letterbox. Não repetir cenas, gerar ruído, escrever arquivos esparsos, truncar ou adicionar bytes de preenchimento.

O teto contratual é 10.000.000.000 bytes. `ffmpeg -fs` termina em um pacote completo e acrescenta as tabelas MOV; a saída deve ficar entre 9.990.000.000 e 10.000.000.000 bytes. Registrar a distância exata ao limite, sem afirmar que a mídia tem exatamente dez bilhões de bytes. O teste anterior continua cobrindo o limite exato. Pelo menos 99,9% do arquivo deve corresponder a pacotes de áudio/vídeo; atoms free/skip somados não podem exceder 1 KiB.

Alternativas rejeitadas: vídeo de um segundo preenchido (não exercita a carga); arquivo pessoal (desnecessário e sem fonte reproduzível); download de um master de dezenas de GB (maior transferência e disco sem melhorar o contrato testado).

## TD-03.9 — Prova de processamento completo

Decisão: somar pacotes em streaming; decodificar toda a origem com `-xerror`; fazer multipart real; aguardar worker independente; comparar hash e tamanho do download; baixar e decodificar toda a reprodução; exigir mesmo número de frames e duração com tolerância inferior a um segundo, H.264/AAC, faststart, thumbnail e Range no início/meio/fim. A cada dois segundos amostrar a resposta HTTP da API; exigir HTTP 200 em menos de cinco segundos. Registrar máximos amostrados de memória e CPU, sem tratá-los como pico absoluto.

## TD-03.10 — Ambiente e execução

Decisão: CI público em runner descartável, serviços reais Compose, mínimo de 45 GB livres no filesystem de Docker e das fixtures, timeout do job 120 minutos e espera do worker até quatro horas (o timeout global continua prevalecendo). Falta de espaço é falha, nunca skip para a carga solicitada. Nenhuma nova dependência ou contrato público. As correções de aplicação só serão feitas se o teste revelar defeito.

Revisão independente: avaliou antes da implementação os limites de disco, 2 CPUs/2 GiB do worker, timeouts e necessidade de validação integral. Fluxo autorizado: research → plan-context → plan-validate → plan-resolve → plan-build → implement; execução contínua e publicação feature → dev → main.
