---
kind: task
name: task-real-video
---
# Contexto

Pedido: validar com vídeo real próximo ao limite de 10 GB, corrigir eventuais falhas e atualizar GitHub sem submeter à Full Cycle. Subprojeto: backend e CI. Frontend fora do escopo.

Base: `25d161b`, branch `feature/video-real-10gb` criada a partir de dev atualizado por fast-forward para main. Pesquisa em `docs/decisions/technical-decisions-real-video.md`, TD-03.8 a TD-03.10.

O pipeline existente usa multipart S3/MinIO, PostgreSQL, BullMQ/Redis e worker FFmpeg separado. O smoke existente gera um segundo de testsrc e um atom free. A nova execução usa cenas reais e áudio e testa a reprodução inteira, mantendo também o teste de tamanho exato anterior.

Artefatos: preparador/inspector Python sem dependências adicionais, modo arquivo em smoke-worker.mjs, orquestração Compose e evidências JSON/texto. Mídia grande e credenciais não serão versionadas nem enviadas como artifact.
