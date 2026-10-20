# Validação com conteúdo audiovisual real

**Aprovada** no [CI 39345912643](https://github.com/marcoviz/vertice-video-platform/actions/runs/39345912643), [job 118378524699](https://github.com/marcoviz/vertice-video-platform/actions/runs/39345912643/job/118378524699), código `5d1fe456cfbac330aa192d27fb5455287cfa4887`. Conclusão remota: `success`, em 20/10/2026 às 00:25 UTC (19/10 no Brasil). As alterações posteriores a esse código são documentação/evidências e merges; nenhum resultado foi inferido do planejamento ou do piloto.

## Mídia

Fonte: **Tears of Steel**, Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), [créditos](https://mango.blender.org/), [arquivo e atribuição Xiph](https://media.xiph.org/tearsofsteel/README.txt). Fonte 1080p VP8/Vorbis com SHA-256 fixado no preparador. Um trecho contínuo inicial foi recodificado para DNxHD 185M/25fps e áudio PCM estéreo, com letterbox preservando a proporção. Não há loops de cenas, ruído sintético, arquivo esparso, truncamento ou bytes acrescentados para aumentar o tamanho.

| Propriedade | Resultado medido |
|---|---|
| Arquivo MOV | **9.999.648.760 bytes** |
| Distância ao teto decimal | 351.240 bytes, aproximadamente 0,0035% |
| Pacotes de áudio/vídeo | 9.999.399.424 bytes — **99,99750655%** |
| Estrutura MOV | `ftyp`, `mdat` e `moov`; nenhum atom `free` ou `skip` |
| Duração do container | 432,375 segundos |
| Vídeo | 1920×1080, DNxHD, 25 fps, 10.808 quadros |
| Áudio | PCM 16 bits, estéreo, 48 kHz, 432,372167 s |
| Preparação + inspeção | 129,633 s, após o download da fonte |
| SHA-256 do arquivo e do download | `1efa82bebe8ed6d9e2743132dc14a9f381349231a67b88595a895d105bf0f153` |

O término natural de pacotes deixa a mídia ligeiramente abaixo de 10 GB. O cenário sintético separado continua cobrindo exatamente 10.000.000.000 bytes; esta mídia real não é apresentada como tendo esse tamanho exato.

## Caminho completo

- Origem completamente decodificada com `ffmpeg -xerror`: 10.808 quadros, áudio incluído, sem erro.
- Upload real em **150 partes**, com buffer de no máximo uma parte por vez. API e worker executaram em containers separados, com PostgreSQL, Redis/BullMQ e MinIO reais.
- Estado final `ready`; job `completed`, `attemptsMade=1`, `attemptsStarted=1`.
- Reprodução de 142.594.943 bytes, H.264/AAC, 1920×1080, 10.808 quadros, duração de 432,378 s e faststart. Decodificação integral aprovada; duração do áudio também conferida.
- Download original: tamanho e SHA-256 idênticos à origem. Range 206 no início/meio/fim, com bytes comparados à reprodução integral baixada. Thumbnail JPEG consumida e decodificada.
- Processamento após completar upload: **274,250 s**. Fluxo medido do smoke, incluindo upload e verificações: **383,503 s**. Geração/download da fixture não fazem parte desse último número.

## Recursos e responsividade

O worker manteve a configuração de **2 CPUs e 2 GiB**. Foram registradas 72 amostras por container: máximo amostrado de **121,9 MiB** na API e **540 MiB** no worker. CPU máxima amostrada: 14,46% e 207,68%, respectivamente; 100% equivale a um núcleo e as amostras não representam picos absolutos.

Foram feitas **191 consultas HTTP ao endpoint raiz** durante o smoke: todas HTTP 200, p95 **4,072 ms**, máximo **14,044 ms**, zero falhas. Isso mede disponibilidade do endpoint raiz durante essa carga, não latência de todos os endpoints sob concorrência.

Não houve OOM nem reinício de containers. Antes da carga real havia 93.502.582.784 bytes livres no filesystem Docker. Fixtures e volumes exclusivos da rodada foram removidos pelo cleanup.

## DoD e alterações

Passaram novamente **183 testes unitários/de integração em 29 suítes**, **56 e2e em quatro suítes**, TypeScript, Prettier e ESLint (zero erros, 23 avisos herdados). Os cenários anteriores de 67.109.888 bytes e 10.000.000.000 bytes também passaram.

Nenhum defeito funcional apareceu no pipeline da aplicação. As mudanças desta rodada são no teste: fonte audiovisual real, inspeção/decodificação completa, hashes, áudio, JPEG, faststart, ranges, responsividade, estado da fila, watchdogs e coleta de evidências. Não houve alteração do código em `src/`, schema ou contratos públicos. A revisão independente corrigiu lacunas do próprio verificador antes desta execução final.

O run anterior `39345682558` foi cancelado quando a atualização dos watchdogs e registros gerou esta execução. Ele não é evidência de aprovação. O piloto local de 99.020.076 bytes é apenas diagnóstico.

## Reprodução e evidências

```sh
cd nestjs-project
VERIFY_REAL_VIDEO=1 sh scripts/verify-compose.sh
```

Exige pelo menos 45 GB livres no host e Docker. Falta de espaço reprova a execução real; não vira skip. O smoke espera até quatro horas pelo worker, mas o timeout global do CI de 120 minutos prevalece. Nenhum segredo externo é necessário; a fonte pública é validada por SHA-256.

- [Resultado permanente estruturado](evidence-summary.json).
- [Amostras completas de recursos](resource-samples.log).
- [Revisão independente do código e da evidência](cross-review.md).
- [Artefato do CI](https://github.com/marcoviz/vertice-video-platform/actions/runs/39345912643/artifacts/12231771511), retenção de sete dias; somente JSON/texto, sem mídia grande.
- Log completo preservado localmente em `work/real-video/ci-success.log`; tamanho e SHA-256 registrados no JSON permanente.

Nada foi submetido à avaliação da Full Cycle.
