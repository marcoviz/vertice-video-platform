# Progresso — fase 03

Estado: **DoD técnico aprovado no Docker Compose isolado** em 19/10/2026. A transferência física de um arquivo de 10 GB segue não medida; a fronteira de 10 GB foi validada por contrato e sem alocação desse volume.

| SI | Estado | Evidência e verificação |
|---|---|---|
| SI-03.0 | artefatos produzidos antes do código | research/context/validation clean/plano e AGENTS/.codex; workflow manual equivalente |
| SI-03.1 | concluído | entidade/repository/migration; limites, tamanhos, ETags e persistência aprovados em testes |
| SI-03.2 | concluído | proprietário, rascunho, multipart direto, conclusão idempotente e cancelamento aprovados em testes reais |
| SI-03.3 | concluído | dispatcher de outbox, BullMQ/Redis, FFmpeg e thumbnail aprovados em e2e e smoke de API + worker separados |
| SI-03.4 | concluído | metadata pública, redirects, Range 206 e download original aprovados em e2e |
| SI-03.5 | concluído | Compose isolado executou suíte completa, tsc, lint e smoke-worker; recursos descartáveis removidos |

## Execuções observadas em 19/10/2026

- Node bundled 24.19.0, dependências locais instaladas: AWS SDK 3.1152.0, BullMQ 6.3.16, ioredis 5.4.2 e dotenv 18.0.8.
- `jest --runInBand --runTestsByPath` nos três arquivos unitários de vídeos: **3 suites, 29 testes aprovados inicialmente; teste adicional de disco indisponível aprovado depois**.
- `jest --runInBand --testRegex='.*\.spec\.ts$'`: **12 suites, 91 testes aprovados**, incluindo base.
- `tsc --noEmit`: **exit 0** após todas as adições de tipos de resposta.
- ESLint em `{src,apps,libs,test}/**/*.ts`: **exit 0**, sem erros; avisos de mocks da base permanecem.
- Validações acima são diagnósticas locais autorizadas, e **não substituem comandos container-only do DoD**.
- Primeira tentativa de suite chamada unitária encontrou 3 testes da base que abriam Postgres, apesar do sufixo `.spec.ts`; foram renomeados para `.integration-spec.ts`, sem remover assertions. A tentativa foi interrompida ao confirmar a dependência real de DB.
- `sh scripts/verify-compose.sh` em projeto descartável `vertice-video-check`: **exit 0**. Migration TypeORM aplicada no Postgres; **28 suites, 176 testes** unitários e de integração; **4 suites, 56 testes** e2e; `tsc --noEmit` aprovado; lint **0 erros, 23 avisos** de tipos `any` nos testes legados de auth; smoke de containers separados API + worker com multipart, fila, FFmpeg, thumbnail, Range e download original aprovado. FFmpeg 5.1.9 disponível. O script removeu containers e volumes de teste ao terminar. A saída resumida está em [verification-output.txt](verification-output.txt); o log bruto está em `work/verify-video.log` da tarefa.
- `openapi.json` foi reexportado pelo script da aplicação em container após a suíte, **exit 0**, e inclui os nove caminhos `/videos` da fase.
- A primeira execução e2e expôs dependência opcional `ioredis` não instalada e vazamento de histórico de rate limiting entre testes. `ioredis@5.4.2` foi fixado no lock pnpm; os testes agora limpam todo o armazenamento do throttler pelo método público e restauram os spies de e-mail entre casos. A execução completa subsequente aprovou.
- O teste de fronteira de 10 GB valida o contrato sem alocar esse arquivo; não é prova de transferência física de 10 GB.

## Ajustes de qualidade necessários na base

Tipagens explícitas para respostas HTTP/Mailpit, fixtures e erros PostgreSQL; nenhuma assertion retirada. A exceção de lint `unbound-method` é limitada ao arquivo unitário de auth onde Jest inspeciona mocks, sem invocá-los desacoplados. Defaults de DB usam `db`. Removido lock npm obsoleto; `pnpm-lock.yaml` é o lock único do backend. Suíte migration estendida para 5 tabelas e rollback de videos.

## Limitações e rastreabilidade

1. A verificação em Docker foi executada integralmente com o script `nestjs-project/scripts/verify-compose.sh`, sem uso dos volumes da base de desenvolvimento.
2. **Concluído:** migration da fase gerada pelo CLI TypeORM com timestamp fixo, aplicada em Postgres real e `migration:generate --check` sem diferenças (exit 0), antes da suíte completa. O esboço SQL da fase foi substituído antes de qualquer aplicação. A geração usa `@Check` para tamanho/status e a relação Video↔Channel. Script em `scripts/generate-video-migration.sh` recusa regeneração se a tabela videos já existe.
3. Upload físico de 10 GB e métricas de recursos da API não foram coletados; executar apenas se for necessário demonstrar volume real.
4. Context7 não esteve exposto; docs oficiais foram consultadas via web. Configuração MCP fornecida no projeto, sem alteração global.
5. Relação Video↔Channel bidirecional conforme as rules. O helper de DB acrescenta a entidade Video quando fixtures antigas registram Channel, preservando os testes das fases anteriores.

Nenhuma avaliação foi enviada. O DoD técnico da fase está concluído com a ressalva de medição física de 10 GB acima.
