# Referências consultadas

Context7 MCP consultado efetivamente nesta rodada, antes de implementar os scripts: resolução `ffmpeg` → `/websites/ffmpeg_documentation` e consulta `query-docs`. O retorno confirma que `-fs` pode exceder levemente o valor solicitado e explica a decodificação com muxer null e o formato DNxHD/SMPTE VC-3.

Versão do container verificada: **FFmpeg 5.1.9-0+deb12u1**. Context7 documenta a versão corrente, sem versão fixa 5.1; as opções e suporte DNxHD foram conferidos também pelo `ffmpeg -h encoder=dnxhd` instalado e pelo piloto real. Não se adotou API nova exclusiva da documentação recente.

- [FFmpeg CLI](https://ffmpeg.org/ffmpeg.html): `-fs`, mapeamento de streams, progress e null muxer.
- [FFprobe](https://ffmpeg.org/ffprobe.html): show_entries e show_packets.
- [Fonte e atribuição](https://media.xiph.org/tearsofsteel/README.txt).
- [Filme](https://mango.blender.org/about/) e [licença CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

As consultas brutas estão preservadas no workspace em `work/real-video/context7-ffmpeg-{resolve,docs}.json`. A fonte de mídia tem SHA-256 fixado no preparador; bibliotecas Node e serviços mantêm APIs existentes do smoke anterior.
