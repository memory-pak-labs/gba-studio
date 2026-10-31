# Backgrounds com cobertura completa do viewport

Arte original gerada com OpenAI Imagegen em 2026-10-29, usando somente os fundos próprios anteriores como referência de estilo. Licença: Project-owned. Nenhum pixel de jogo comercial ou pacote externo foi usado.

O usuário aprovou explicitamente os três fundos Menu, Custom e Mapa-múndi depois das prévias e da revisão no Player. As novas versões substituem os arquivos padrão de mesmo nome, preservando os identificadores e referências existentes. Os antigos não são distribuídos junto com as substituições.

Brief: recompor os fundos originais em um canvas 3:2 que preencha integralmente 240 × 160 pixels, sem faixas superiores/inferiores no Menu nem laterais em Custom e Mapa-múndi. Manter paleta ocre/terracota, espaço central livre no Menu, sala vazia em Custom e ilha com montanhas, bosques e caminhos no Mapa-múndi. Não inserir texto, personagens ou HUD nos fundos.

As três prévias preservadas usam nearest-neighbor, sem redução global de paleta. Os PNGs distribuídos usam a preparação real do assetc em 4bpp e 14 bancos de paleta; os planos por tile estão em background-defaults.json. A quantização restrita gerou o diagnóstico técnico attention, mantido no manifesto e aceito pela revisão visual explícita; não se confunde com erro de mapeamento de tiles, que é zero. Hashes e custos constam em manifest.json. Esta aprovação visual não certifica hardware físico.
