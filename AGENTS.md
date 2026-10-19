# Vértice Video Platform — Codex

Continuação da plataforma StreamTube do curso, com fase 03 no backend. As Fases 01–02 e seu frontend permanecem na base.

Leia `CLAUDE.md`, `nestjs-project/AGENTS.md` e as regras aplicáveis de `.claude/rules/` antes de editar. As regras originais continuam vigentes. Git Flow: feature/* a partir de dev; nunca commit direto em main.

## Workflow equivalente
Execute research → plan-context → plan-validate → plan-resolve → plan-build → implement, nesta ordem, manualmente ou com as skills locais de `.agents/skills/`. Use os mesmos artefatos e estrutura da base. O usuário autorizou execução contínua nesta sessão; decisões rotineiras são documentadas sem interromper a cada SI. Não declare DoD sem todos os testes reais de containers.

Os agentes de leitura originais em `.claude/agents/` servem de contratos de papel para pesquisa e revisão. O orquestrador delegou a fase a um subagente; a implementação desta fase ocorre sequencialmente para manter dependências entre SIs.

## Estado da fase 03
`nestjs-project/src/videos/`: multipart direto S3/MinIO, propriedade pelo canal, tabela videos, publicação assíncrona via outbox na própria linha, BullMQ/Redis, worker FFmpeg independente. Estados draft → processing → ready/failed; endpoints em `docs/phases/phase-03-videos/phase-03-videos.md`.

Configuração MCP de projeto em `.codex/config.toml`. Não alterar configurações globais. Se context7 não estiver disponível na sessão, usar docs oficiais e registrar a limitação; não afirmar que a ferramenta foi executada. Planejamento clean não significa testes aprovados.
