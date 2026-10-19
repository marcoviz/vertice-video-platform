# Vértice — plataforma de vídeos

Continuação da base oficial StreamTube com a Fase 03: upload direto de até **10GB decimais**, processamento assíncrono, thumbnail, reprodução parcial e download. Backend NestJS 11, PostgreSQL 17, MinIO, Redis/BullMQ e worker FFmpeg. As Fases 01–02 e o frontend fornecidos pelo curso estão preservados. A interface de vídeo está fora do escopo.

## Executar

Requisitos: Docker Engine/Desktop com Compose v2, ao menos 30GB livres por worker e memória disponível para os containers. O build usa Node 24, FFmpeg e dependências npm fixadas em `nestjs-project/pnpm-lock.yaml`. `npm` continua disponível para os scripts do projeto.

```sh
cd nestjs-project
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs video-worker
```

O serviço `migrate` aplica o schema; `storage-init` cria bucket privado. O servidor limpa uploads multipart incompletos após 24h, com varredura a cada hora. A API aguarda essas etapas. O MinIO usa CORS global configurado por `S3_CORS_ALLOW_ORIGIN`; ajuste para a origem do seu cliente. Swagger pode ser habilitado com `SWAGGER_ENABLED=true`: `http://localhost:3000/api/docs`. Mailpit: `http://localhost:8025`. Credenciais em `.env.example` são apenas para desenvolvimento local; substitua-as antes de qualquer implantação.

As comunicações entre containers usam nomes Compose (`db`, `storage`, `queue`). As URLs assinadas têm como hostname padrão `storage`, resolvível na rede Compose. Execute o cliente de upload dentro da rede como abaixo. Para cliente externo, configure `S3_PUBLIC_ENDPOINT` com um hostname que o cliente alcance e que encaminhe sem alterar Host ao MinIO; não reescreva uma URL após assinada. A API usa `S3_ENDPOINT` interno separadamente.

## Enviar e reproduzir

1. Cadastre e confirme o usuário pelos endpoints `/auth` existentes (email no Mailpit); obtenha `access_token` em `/auth/login`.
2. Copie um arquivo para o container e execute o cliente de upload. O token é só passado ao processo, nunca salvo no repositório.

```sh
docker compose cp /caminho/video.mp4 nestjs-api:/tmp/video.mp4
# Configure TOKEN no seu terminal com o access_token obtido.
docker compose exec -e TOKEN -e REFRESH_TOKEN nestjs-api node scripts/upload-video.mjs /tmp/video.mp4 'Meu vídeo'
```

O cliente usa no máximo uma parte de 64MiB de memória, assina lotes de até 16 partes e renova URLs expiradas. Configure também `REFRESH_TOKEN` para uploads que ultrapassem os 15 minutos do access token; a rotação fica apenas na memória do processo. O upload não atravessa a API. Ela cria o draft, assina partes, verifica ETags/tamanhos no storage e confirma o total. O cliente imprime o ID e URL pública; consulte `/videos/{id}/status` com JWT até ready. Quando pronto:

- `GET /videos/{slug}`: título, duração, dimensões e URLs.
- `GET /videos/{slug}/stream`: redireciona 307 para MP4 H.264/AAC, `faststart`; envie `Range: bytes=0-1023` ao storage para receber 206.
- `GET /videos/{slug}/thumbnail`: JPEG gerado do vídeo.
- `GET /videos/{slug}/download`: original com `Content-Disposition: attachment`.

Drafts/processing não são públicos. Signing, conclusão, cancelamento e status exigem o proprietário. A URL UUID é protegida por unicidade no banco. Falhas normais de processamento repetem até três vezes, com backoff; erro final aparece como `PROCESSING_FAILED`. O worker reconcilia o estado real da fila com o banco no início e a cada 2 segundos, incluindo falhas por stalls, eventos perdidos e reinícios. Updates condicionais preservam resultados `ready`; jobs ausentes são republicados com ID estável. Jobs terminais permanecem no Redis para permitir essa recuperação; a limpeza operacional só deve removê-los depois de confirmar estado terminal no banco. Bytes e metadados de storage não são expostos nos DTOs públicos.

## Verificação

```sh
cd nestjs-project
sh scripts/verify-compose.sh
```

O script cria o projeto Compose isolado `vertice-video-check`, executa unitários, integração, e2e, TypeScript e lint, e remove apenas seus próprios volumes ao terminar. Não execute contra dados de produção. A suíte e2e gera um vídeo sintético com FFmpeg, faz multipart real, processa via BullMQ/Redis e testa thumbnail, Range 206 e download. O limite de 10GB também é testado como contrato. O smoke físico usa por padrão 64 MiB + 1024 bytes, divididos em duas partes reais, e confere o SHA-256 do download original. A massa é um MP4 sintético de um segundo acrescido de um atom `free` válido; prova transporte e limite de tamanho, sem representar 10GB de frames codificados.

Ao final, o script inicia os processos compilados da API e do worker em containers separados e repete o fluxo de mídia via HTTP com `scripts/smoke-worker.mjs`. Para medir 10GB físicos, use `SMOKE_VIDEO_BYTES=10000000000 sh scripts/verify-compose.sh`, com capacidade de disco para MinIO e temporário do worker. O cliente gera as partes sem gravar outro arquivo grande e baixa por streaming. MinIO e seu cliente são compilados de releases oficiais fixos; a primeira execução leva mais tempo porque a edição comunitária passou a ser distribuída por código-fonte.

**Validação em 19/10/2026:** o Compose isolado aprovou 176 testes unitários/de integração, 56 e2e, TypeScript, lint sem erros e o fluxo real com API e worker em containers separados. O contrato de 10 GB foi testado sem transferir fisicamente esse volume. O [progresso](docs/phases/phase-03-videos/progress.md) e a [saída resumida da verificação](docs/phases/phase-03-videos/verification-output.txt) registram as evidências. O [OpenAPI exportado](nestjs-project/openapi.json) inclui os nove caminhos de vídeos. Não há submissão automática à plataforma.

O [workflow de CI](.github/workflows/verify-video.yml) executa esse DoD em `ubuntu-24.04`, sem secrets externos, com logs de texto retidos por um dia. Depois do smoke padrão, tenta 10GB físicos somente se houver mais de 25GB livres no filesystem do Docker; o resultado explicita qualquer `SKIP`. A [validação da revisão](docs/tasks/task-video-reliability/ci-validation.md) distingue diagnóstico local de execução Docker e registra o resultado quando disponível.

## Decisões e uso de IA

A fase foi conduzida com Codex em execução contínua, com pesquisa oficial, contexto, validação, plano e implementação sequencial. A instrução equivalente está em `AGENTS.md`, as skills locais em `.agents/skills`, e a configuração MCP é de projeto em `.codex/config.toml`. Na implementação original Context7 não esteve exposto, e a pesquisa registrou o fallback para documentação oficial via web. Na revisão de confiabilidade, o MCP Context7 foi consultado de fato antes das novas alterações, e as diferenças para as versões instaladas foram conferidas em [library-refs.md](docs/tasks/task-video-reliability/library-refs.md); essa consulta posterior não altera o registro histórico.

- `docs/decisions/technical-decisions-phase-03-videos.md`: alternativas e escolhas.
- `docs/phases/phase-03-videos/`: contexto, validação, referências, SIs/contratos e progresso.
- [Revisão de confiabilidade](docs/tasks/task-video-reliability/progress.md): reconciliação de falhas terminais e evidências de multipart físico.
- `nestjs-project/src/videos/`: domínio, repository, adapter S3 e processamento.
- `nestjs-project/src/database/migrations/1792400000000-CreateVideos.ts`: schema da fase.

A Fase 03 foi desenvolvida neste projeto a partir do enunciado e do starter oficial StreamTube, que fornece as Fases 01–02 e o frontend. O histórico segue Git Flow: a implementação inicial foi integrada por `feature/video-pipeline` → `dev` → `main`. A revisão de confiabilidade está em `feature/video-final-fixes`, criada a partir de `dev` após seu alinhamento por fast-forward com a entrega anterior em `main`.
