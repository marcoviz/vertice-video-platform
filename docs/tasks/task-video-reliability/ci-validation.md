# Validação em CI — revisão de confiabilidade

Estado em 19/10/2026: **CI aprovada e DoD concluído**. O [run 39336804550](https://github.com/marcoviz/vertice-video-platform/actions/runs/39336804550), [job 118348228106](https://github.com/marcoviz/vertice-video-platform/actions/runs/39336804550/job/118348228106), validou o SHA `7e1553ecb8b89010395a6a92dff1d198abcf8ab8`. A conclusão de sucesso foi confirmada pelo conector do GitHub; as contagens, hashes, durações e amostras abaixo foram extraídos do log completo.

Workflow: [verify-video.yml](../../../.github/workflows/verify-video.yml), disparado em pushes para `feature/video-final-fixes`, `dev` e `main`, ou manualmente. Runner GitHub-hosted `ubuntu-24.04`, timeout de 45 minutos, `contents: read`, sem secrets de serviços externos; checkout não persiste credenciais. Os SDKs preinstalados .NET/Android/Haskell, sem uso no projeto, são removidos apenas no runner descartável para liberar disco.

Actions fixadas por SHA, conferidas nas releases oficiais em 19/10/2026:

- [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1): `3d3c42e5aac5ba805825da76410c181273ba90b1`.
- [actions/upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2): `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.

O script `nestjs-project/scripts/verify-compose.sh` constrói imagens, inicia Postgres/Redis/MinIO/Mailpit reais e executa migrations, suíte completa unit/integração, e2e, TypeScript, Prettier dos arquivos de vídeo e ESLint de todo o backend. O lint não usa auto-fix. Depois inicia API e worker compilados em containers separados e faz upload/download físico de 67.109.888 bytes (duas partes), validando status, metadados, thumbnail, Range e SHA-256.

A execução estendida de 10.000.000.000 bytes ocorre somente depois dessas verificações e se o filesystem efetivo do Docker ainda tiver **mais de 25.000.000.000 bytes livres**. A saída registra `RUN`, `PASS` ou `SKIP` com o espaço medido. Pular por disco não é aprovação de 10GB. Durante essa etapa, Docker stats registra amostras de memória/CPU/rede da API e do worker. O gerador usa MP4 curto com padding `free` válido: demonstra I/O real e limite, não uma carga de 10GB de frames codificados.

Saída combinada preservada com `set -euo pipefail` e `tee`, sem mascarar falhas. O artifact contém somente texto (últimos 5MiB do log, resumo e SHA/URL do run), retido por um dia; mídia e volumes nunca são enviados. O trap captura logs finais e remove somente o projeto Compose descartável `vertice-video-check` e seus volumes.

## Resultados do run aprovado

| Etapa | Resultado | Evidência |
|---|---|---|
| Unitários e integração | aprovado | 183 testes em 29 suítes, em containers |
| E2E | aprovado | 56 testes em quatro suítes, em containers |
| TypeScript | aprovado | tsc --noEmit sem erros; execução sequencial avançou às etapas seguintes |
| Prettier | aprovado | arquivos de vídeo, e2e e smoke, anterior ao smoke |
| ESLint | aprovado com avisos | zero erros e 23 avisos herdados |
| Smoke físico padrão | aprovado | 67.109.888 bytes em duas partes; API/worker separados, fila, FFmpeg, thumbnail, Range e download original |
| Smoke físico de 10 GB | aprovado | 10.000.000.000 bytes em 150 partes; mesmos checks de mídia e integridade; sem SKIP |
| Conclusão do CI e conferência integral | aprovado | sucesso confirmado; DoD concluído para o SHA acima |

Smoke padrão: SHA-256 `703b03ea1aac04f31d255d7637c000ab6c525e73787f6d9ef85f022ccbae8756`, duração de 3.373 ms.

Smoke de 10 GB: SHA-256 `2a4e3b292513fb843dca3a3dc8edebca82070f00b9033f1c0f4d5f26b22346be`, duração de 176.798 ms. Foram transferidos 10.000.000.000 bytes em 150 partes: 149 de 67.108.864 bytes e a última de 779.264 bytes. Havia 103.504.568.320 bytes livres no filesystem do Docker no início dessa etapa. O log contém tanto o PASS de integridade do smoke quanto o PASS da etapa estendida.

O monitor iniciado na etapa estendida registrou 41 amostras de Docker stats para cada container: 40 entre a linha RUN e o PASS final, mais uma concluída durante o cleanup às 22:50:23 UTC. As maiores leituras de memória foram **161,3 MiB na API** e **238,3 MiB no worker**. São máximos entre as amostras coletadas, não picos absolutos de memória.

Resumo estruturado: [evidence-summary.json](evidence-summary.json). [Artifact de logs](https://github.com/marcoviz/vertice-video-platform/actions/runs/39336804550/artifacts/12226819012), sujeito à retenção de um dia. A cópia integral conferida, `work/fixes-final/video-ci-success.log` na área de trabalho da revisão, tem 314.006 bytes e SHA-256 `9fe82e0ded78537fd6d1d341cc60c962e57ab6ed29cc579d8ccb7f31759d843f`. O resumo preserva os resultados essenciais independentemente da expiração do artifact.

## Tentativas anteriores e ambiente local

- [Run 39334256414](https://github.com/marcoviz/vertice-video-platform/actions/runs/39334256414): falhou no Promise.all de DROP TABLE da fixture de migrations, com deadlock e falhas decorrentes do schema incompleto. Resultado: 26 suítes aprovadas e três com falha; 173 testes aprovados e dez com falha. Os testes novos de fila e de repositório de vídeos passaram, mas isso não aprovou a execução completa. Correção: DROP TABLE sequenciais e destroy em finally, commit `7797540308cb353409cf202cbf3c5688bdc8228c`.
- [Run 39336145385](https://github.com/marcoviz/vertice-video-platform/actions/runs/39336145385), SHA `7797540308cb353409cf202cbf3c5688bdc8228c`: aprovou 183 testes unitários/de integração, 56 e2e e TypeScript; parou na regra prettier/prettier do ESLint em `migrations.integration-spec.ts`, com um erro de formatação e 23 avisos herdados. A formatação foi corrigida no SHA atual. O smoke físico não foi alcançado nessa tentativa.
- A tentativa local de validação completa em containers foi interrompida por reboot, depois de problemas no backend da VM do Docker Desktop. Diagnósticos locais e verificações pontuais não substituem a execução completa; não se declara aprovação da suíte local desta revisão.

Context7 foi consultado nesta rodada antes das alterações dependentes, conforme [library-refs.md](library-refs.md). A implementação original usou o fallback de documentação oficial via web quando Context7 não estava exposto; a consulta posterior preserva esse histórico.
