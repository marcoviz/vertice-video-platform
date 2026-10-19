# Validação em CI — revisão de confiabilidade

O Docker Desktop local ficou indisponível por falha do backend da VM. O coordenador autorizou diagnóstico e formatação locais, preservando o requisito de DoD em containers. A CI foi preparada; este arquivo ainda não declara uma execução aprovada.

Workflow: [verify-video.yml](../../../.github/workflows/verify-video.yml), disparado em pushes para `feature/video-final-fixes`, `dev` e `main`, ou manualmente. Runner GitHub-hosted `ubuntu-24.04`, timeout de 45 minutos, `contents: read`, sem secrets de serviços externos; checkout não persiste credenciais. Os SDKs preinstalados .NET/Android/Haskell, sem uso no projeto, são removidos apenas no runner descartável para liberar disco.

Actions fixadas por SHA, conferidas nas releases oficiais em 19/10/2026:
- [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1): `3d3c42e5aac5ba805825da76410c181273ba90b1`.
- [actions/upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2): `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.

O script `scripts/verify-compose.sh` constrói imagens, inicia Postgres/Redis/MinIO/Mailpit reais e executa migrations, suíte completa unit/integração, e2e, TypeScript, Prettier dos arquivos de vídeo e ESLint de todo o backend. O lint não usa auto-fix. Depois inicia API e worker compilados em containers separados e faz upload/download físico de 67.109.888 bytes (duas partes), validando status, metadados, thumbnail, Range e SHA-256.

A execução estendida de 10.000.000.000 bytes ocorre somente depois dessas verificações e se o filesystem efetivo do Docker ainda tiver **mais de 25.000.000.000 bytes livres**. A saída registra `RUN`, `PASS` ou `SKIP` com o espaço medido. Pular por disco não é aprovação de 10GB. Durante essa etapa, Docker stats registra amostras de memória/CPU/rede da API e do worker. O gerador usa MP4 curto com padding `free` válido: demonstra I/O real e limite, não uma carga de 10GB de frames codificados.

Saída combinada preservada com `set -euo pipefail` e `tee`, sem mascarar falhas. O artifact contém somente texto (últimos 5MiB do log, resumo e SHA/URL do run), retido por um dia; mídia e volumes nunca são enviados. O trap captura logs finais e remove somente o projeto Compose descartável `vertice-video-check` e seus volumes.

## Estado observado

- Diagnóstico local autorizado: TypeScript sem erros, formatação Prettier de vídeo aprovada, lint do arquivo novo de integração sem erros, shell parse e git diff --check aprovados.
- Docker/CI: **ainda não executado nesta revisão**. Registrar URL, SHA e resultados após a execução real, antes de declarar DoD.
