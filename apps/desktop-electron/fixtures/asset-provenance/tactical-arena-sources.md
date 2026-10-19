# Arena Tática — mapa amplo e HUD compacta

Aprovação explícita: 17/10/2026, revisão02 na galeria8809; usuário autorizou integração, movimento e combate.

Origem: novas artes originais produzidas com image_gen sob direção do usuário. Licença declarada: Project-owned AI-generated artwork. Referências de encenação foram consultadas sem copiar pixels comerciais. Código continua sob a licença do repositório; a licença da arte é registrada separadamente.

Fontes: arena `exec-ba36186e-1e70-47c3-9274-726a746af1f9.png`; HUD `exec-5c845ed3-098f-49ca-a26b-6e3e3d8e9136.png`; Nara `exec-5f1c7ccb-547b-4110-96fd-bb4761b1544d.png`; sentinela `exec-99065147-40ca-454f-adfe-eb2684a2617c.png`; outcomes `exec-0630199b-6b92-4c25-b240-318296af76e3.png`. Os hashes dos PNGs promovidos constam no manifesto.

BG preparado768×512 e folhas de44quadros64×64 são cópias exatas dos candidatos aprovados. Não houve nova escala, quantização ou fusão de tiles nesta integração. Os corpos permanecem próximos de48px; canvas64×64 contém padding e alcance de poses. Âncora32,62.

Foreground é uma máscara de cópia dos mesmos pixels do BG para oclusão; polígonos registrados no manifesto. Sua paleta reutiliza as cores do BG, sem reduzir ou duplicar cores compartilhadas. A grade16×16, alturas, rampas, colisões e câmera pertencem aos dados de cena.

A HUD foi separada por recortes exatos em selo de turno, ficha e ações. Retratos são recortes dos mesmos atores. Fonte Porto HUD B preservada por pixel, com fundo transparente; avanço7px mantém suas seis colunas de tinta. Barra e cursor de opção são primitivas geométricas da composição aprovada. Texto e HP são dinâmicos.

Consumidores: BG/foreground paginados8bpp; atores e retratos OBJ8bpp; painéis, fonte, marcadores e barra OBJ4bpp. Compartilhamento de paleta é calculado no pack completo, respeitando os bancos internos de UI. Música e nove cues existentes permanecem intactos. As artes antigas continuam na biblioteca.

A projeção do runtime usa o topo do losango: origem Y68 mais meia altura12 conserva o centro Y80 aprovado. O pivot real32,62 gera offset de desenho−32,−50. Marcadores receberam somente translação de2px dentro do canvas transparente, alinhando o centro ao chão, sem modificar pixels opacos.
