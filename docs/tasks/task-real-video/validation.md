---
status: clean
---
# Validação do plano

- Escopo rastreável ao requisito de upload até 10 GB sem bloquear a API e ao pedido explícito de conteúdo audiovisual real.
- Limite decimal preservado; não aumentar a API para aceitar 10 GiB.
- Fonte identificada/licenciada com checksum, trecho contínuo sem repetição, sem preenchimento artificial do arquivo.
- Resolvida a diferença entre limite exato e término natural de frames: registrar bytes precisos, no máximo 0,1% abaixo do teto; teste exato anterior mantido.
- Resolvido disco insuficiente: exigir 45 GB no Docker e no host; nunca ignorar o novo teste solicitado.
- Resolvido timeout anterior de 600 segundos: modo real usa limite compatível com worker; CI tem limite próprio explícito de 120 minutos.
- Prova independente de integridade, conteúdo decodificado, duração/frames, reprodução, fila e responsividade.
- Sem alteração de schema/contrato. DoD só concluído quando suíte completa e novo teste real passarem.

`clean` refere-se ao planejamento, não a resultado de execução.
