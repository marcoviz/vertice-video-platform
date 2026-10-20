# Revisão independente — mídia real próxima de 10 GB

Revisão somente leitura em 19/10/2026 do commit `5d1fe456cfbac330aa192d27fb5455287cfa4887`, comparado à entrega anterior `25d161b80a9fb6968eb3330fba231c055a4f626e`. Conferidos enunciado salvo, AGENTS/CLAUDE e regras aplicáveis, preparação/inspeção de mídia, smoke, scripts Compose, workflow e artefatos de planejamento. Nenhum arquivo do repositório foi alterado por este revisor.

**Resultado final: nenhum achado concreto pendente no diff final ou discrepância entre as evidências examinadas. O log do CI comprova a aprovação da carga real próxima de 10 GB e das verificações completas para o commit revisado.** A revisão inicial foi estática; a conferência da execução foi acrescentada após a conclusão do CI, sem reexecutar os testes.

## Prova implementada e ajustes incorporados

- Fonte real identificada: *Tears of Steel*, Blender Foundation, CC BY 3.0, com SHA-256 fixo. A preparação recodifica um trecho contínuo para DNxHD/PCM, preservando a proporção; não usa loops de cenas nem preenchimento artificial do arquivo. Exige tamanho entre 9.990.000.000 e 10.000.000.000 bytes, mais de 99,9% em pacotes audiovisual e no máximo 1 KiB somado nos atoms `free`/`skip`.
- Upload em partes reais com memória limitada, hash de origem conferido contra a preparação e download original conferido por tamanho e SHA-256. Reprodução integralmente decodificada, com codecs H.264/AAC, dimensões, frames e duração comparados à origem. Range no início/meio/fim é comparado aos bytes do playback baixado.
- O watchdog agora limita efetivamente ffprobe/FFmpeg durante a leitura de stdout, encerrando e aguardando o processo. O timeout externo do inspector foi elevado a 70 minutos, acima dos limites internos sequenciais de 120 + 300 + 3.600 segundos.
- A prova de faststart agora exige presença de `moov` e `mdat` antes de conferir a ordem. Também foram adicionadas comparação da duração do áudio e decodificação efetiva do JPEG da thumbnail.
- O smoke verifica job BullMQ `completed`, `attemptsMade=1` e `attemptsStarted=1`. A semântica foi conferida no código da versão instalada: conclusão incrementa a primeira contagem e ativação incrementa a segunda.
- O gate exige 45 GB livres no host e no filesystem do Docker. A falta de espaço falha a rodada real, sem `SKIP` que possa ser interpretado como aprovação. A fixture usa diretório temporário exclusivo; cleanup preserva somente diagnósticos pequenos e remove esse diretório. As amostras de recursos também são incluídas no log do CI.

## Evidência examinada e limites

O arquivo local `work/real-video/pilot-result.json` registra **piloto completo aprovado com 99.020.076 bytes**, duas partes, hash original igual, 107 frames decodificados no playback, três ranges conferidos, JPEG decodificado e uma execução BullMQ concluída. Este revisor leu esse resultado; **não executou o piloto, o teste do watchdog, Docker ou suítes de testes**. O piloto é diagnóstico e não prova a carga de 10 GB.

O CI é o [run 39345912643](https://github.com/marcoviz/vertice-video-platform/actions/runs/39345912643), [job 118378524699](https://github.com/marcoviz/vertice-video-platform/actions/runs/39345912643/job/118378524699), para o commit acima. A coordenação confirmou a conclusão remota `success` pelo conector. Este revisor examinou independentemente o log salvo `work/real-video/ci-success.log` e confrontou a extração `work/real-video/evidence-summary.json` com os registros de execução e as asserções do código; não usou navegador nem executou os testes.

### Conferência independente após o CI

- O log contém **183 testes unitários/de integração aprovados em 29 suítes e 56 e2e em quatro suítes**, total de 239. A sequência estrita do script avança após TypeScript, confirma Prettier e registra ESLint com zero erros e 23 avisos. Os smokes anteriores de 67.109.888 e 10.000.000.000 bytes também passaram nesta rodada.
- A fonte real tem **9.999.648.760 bytes**, somente **351.240 bytes abaixo do teto**, em 150 partes: 149 de 67.108.864 bytes e uma de 428.024 bytes. Origem e download apresentam SHA-256 `1efa82bebe8ed6d9e2743132dc14a9f381349231a67b88595a895d105bf0f153`.
- Recalculei soma dos pacotes e proporção audiovisual: **9.999.399.424 bytes, 99,99750655% do arquivo**. O mapa de atoms da origem contém somente `ftyp`, `mdat` e `moov`, cujos tamanhos somam exatamente o tamanho do arquivo. Não há preenchimento `free`/`skip` na origem.
- A origem registra **10.808 frames**, duração de vídeo 432,320 s e duração de contêiner 432,375 s. Tanto origem quanto playback têm decode completo de 10.808 frames. A reprodução H.264/AAC preserva vídeo 1920×1080/25 fps; a diferença de duração do áudio é aproximadamente 0,005833 s. Faststart, JPEG decodificado e os três ranges com bytes correspondentes passaram.
- BullMQ concluiu com `attemptsMade=1` e `attemptsStarted=1`. O log registra API e worker com `OOMKilled=false` e zero reinícios. Processamento até `ready`: **274.250 ms**; smoke completo: **383.503 ms**. A prova de responsividade registra **191 amostras**, zero falhas, máximo **14,044 ms** e p95 **4,072 ms**; os números coincidem exatamente entre o registro JSON no log e a extração.
- Recontei independentemente **72 amostras por container** na seção de recursos do teste real e recalculei os máximos: API **121,9 MiB / 14,46% CPU** e worker **540 MiB / 207,68% CPU**. A primeira marca de coleta é 00:18:55 UTC e a última 00:25:17 UTC; foram impressas juntas no cleanup, sem confundir o horário de impressão com o da coleta. Não são picos absolutos; CPU 100% representa um núcleo.
- Conferi equivalência integral entre `REAL_MEDIA_INPUT`, o campo `input` de `REAL_MEDIA_RESULT` e os dados correspondentes na extração. O objeto `REAL_MEDIA_RESULT` também coincide integralmente com `real_video` da extração. Conferi o log com **347.862 bytes** e SHA-256 `dce482f645180b6240a0fa5096f8e355047e01daee96a6707d529fd2144ebf9c`.

**Nenhuma discrepância encontrada.** O resultado fecha a lacuna anterior de conteúdo audiovisual real; as limitações de medição e generalização abaixo permanecem próprias do teste observado.

Registrar na entrega o tamanho exato obtido, a distância ao teto e a recodificação do trecho real. A mídia termina naturalmente em frames/pacotes e não deve ser descrita como exatamente 10.000.000.000 bytes. O teste anterior permanece como evidência do limite exato. O worker está limitado a 2 CPUs/2 GiB; o CI tem teto global de 120 minutos, que prevalece sobre a espera de quatro horas do smoke. A responsividade medida é a do endpoint raiz da API; as leituras de recursos são amostras, não picos absolutos. Uma execução aprovada comprova a massa e o ambiente observados, sem equivaler a benchmark de todo codec, duração ou conteúdo possível.

Nenhuma submissão à avaliação foi realizada por este revisor.
