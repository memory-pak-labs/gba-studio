# Gravação de cartuchos no desktop

Em **Exportar → Projeto e ROM → Gravar cartucho**, o editor oferece suporte
opcional ao **ChisFlash Burner / Beggar Socket**, USB CDC `0483:0721`.
O perfil inicial é **ChisFlash v1.2, ROM 32 MiB e FRAM 128 KiB**. A memória
de save do projeto deve estar em SRAM / FRAM. Confirme o modelo físico antes
de preparar a gravação. GBxCart RW, Flash 1 Mbit, RTC e outros perfis ainda não
fazem parte desta integração.

## Fluxo

1. Salvar o projeto. O suporte corrigido acompanha a compilação do aplicativo,
   funciona offline e é carregado automaticamente. Não requer atalho, variáveis
   de ambiente, Rust ou outro aplicativo para o usuário final.
2. Selecionar o modelo do gravador (STM por padrão; STC8 quando aplicável),
   buscar e selecionar um gravador USB disponível. Fechar qualquer aplicativo
   que já esteja usando a mesma porta. No Linux, as permissões da porta serial
   precisam estar configuradas; esta integração não altera regras do sistema.
3. Confirmar o perfil do cartucho e escolher **Preparar ROM e backup**.
4. O backend compila os dados atuais com GBAStudioEngine, valida o cabeçalho,
   cria uma cópia imutável para a revisão, identifica o cartucho e compara duas
   leituras de todos os 128 KiB do save.
5. A revisão apresenta porta, chip, capacidade, tamanho e SHA-256 da ROM.
   **Substituir ROM e gravar cartucho** é a ação que inicia a escrita física.
6. Antes de escrever, o backend confere novamente porta, chip, ROM e save.
   Após a verificação do próprio gravador, exporta a região da ROM gravada e
   compara seu SHA-256. Uma leitura integral do save deve ser idêntica ao backup.

O token de revisão pertence à janela, expira após dez minutos e pode ser usado
uma vez. Alterar o projeto, modelo do gravador, porta ou confirmação de perfil invalida a revisão.
Somente uma operação usa o gravador por vez. Durante a escrita, o fechamento
normal da janela e a saída do aplicativo ficam bloqueados; o processo não
oferece interrupção de uma escrita em andamento. Uma falha de energia, remoção
do cabo ou encerramento forçado pode exigir regravação.

Backups, ROM revisada, leitura de confirmação e relatórios JSON ficam em
`cartridge-writer/backups/<id>/` dentro do diretório de dados do aplicativo.
O botão **Mostrar backup do save** revela o arquivo. Não há restauração
automática, apagamento de save, atualização de firmware ou sondagem que escreva
marcadores de detecção no save. Nenhum desses arquivos entra no repositório.

Uma ROM verificada e um save comparado não comprovam inicialização, persistência
ou comportamento no GBA físico. Execute o jogo, salve, desligue e carregue
novamente antes de aprovar um conjunto de gravador/cartucho/firmware.

## Componente externo e licença

- Projeto: [eyenobig/chis-burner-cmd](https://github.com/eyenobig/chis-burner-cmd).
- Versão fixada: `v0.5.2`, commit `8b3eb46d639221f3093ae2b5646fdf9d91fa7999`.
- Licença do componente: [GPL-3.0-only](https://github.com/eyenobig/chis-burner-cmd/blob/8b3eb46d639221f3093ae2b5646fdf9d91fa7999/LICENSE).
- Fontes correspondentes: [árvore exata](https://github.com/eyenobig/chis-burner-cmd/tree/8b3eb46d639221f3093ae2b5646fdf9d91fa7999)
  e [arquivo das fontes](https://github.com/eyenobig/chis-burner-cmd/archive/8b3eb46d639221f3093ae2b5646fdf9d91fa7999.tar.gz).

O auxiliar continua sendo um processo independente sob GPL-3.0-only; não é
importado nem vinculado ao editor. A compilação `0.5.2-gbastudio.1` aplica o patch
em `tools/cartridge-writer/cfb-stm.patch`. A receita fixa o commit upstream, o
submódulo e o SHA-256 do patch em `scripts/cfb-support-source.json`.

O aplicativo inclui executável, `COPYING`, fontes correspondentes com patch e
`Cargo.lock`, além de um manifesto com tamanho e SHA-256 dos arquivos. O backend
recusa alterações nesses recursos e não troca silenciosamente para outro auxiliar.
A assinatura do macOS ocorre normalmente; o manifesto registra os bytes assinados
antes de selar novamente o aplicativo. Os scripts preservam a identidade e as
opções de assinatura existentes.

As preferências do `cfb` independente em `~/.cfb.json` não são lidas nem alteradas.
O subprocesso usa argumentos fixos, sem shell e sem stdin. Para STM, o editor passa
`--no-power-control`, que omite o comando `0xa0` não implementado pelo firmware.
STC8 conserva o caminho upstream de alimentação de 3,3 V. O modelo escolhido fica
preso à transação revisada, incluindo todas as leituras de save e da ROM.

O downloader upstream anterior permanece disponível para instalações de
compatibilidade STC8 sem o componente integrado. Ele não atende STM; o backend
bloqueia operações STM antes de abrir o cartucho se a correção estiver ausente.
Hashes dos artefatos upstream sem o patch:

| Artefato | SHA-256 |
| --- | --- |
| macOS arm64 | `8ecaf84a53b49a6c8f7c762fc8033e8df8b11df8d3809876fb08d8b7316240da` |
| macOS x64 | `6473e7e6bbc92092ff6854c583385b6eef3cb3144f9521bb750a64c5dc8cc033` |
| Windows x64 | `e67871a0f0b67707f9c8166654ee77ff723985ef3a53549aef335e28b972070c` |
| Linux x64 | `ce339af0ca75585eb23e89c42f1107c391a5f53cc5e158d561b6b660c643f490` |

Os artefatos upstream existem para esses sistemas. Os testes do editor e a
execução do auxiliar em cada sistema são evidências distintas; a presença de
um binário upstream não comprova compatibilidade com todas as versões do sistema.

## Preparar o componente integrado

Contribuidores precisam de Git, Rust/Cargo e `tar`; Linux também precisa das
bibliotecas de desenvolvimento do libudev. Usuários do aplicativo instalado não
precisam dessas ferramentas. Execute em `apps/desktop-electron`:

```sh
npm run prepare:cartridge-tools
npm run build
```

O build normal prepara o auxiliar nativo e reaproveita o resultado verificado.
A receita usa checkout separado em `.cache/cfb/`, aplica somente o patch revisado,
executa os testes Rust, compila com `--locked` e gera os recursos ignorados em
`build/cartridge-tools/<platform>-<arch>/`. Binários, caches e QA não entram no Git.
As fontes preservam a licença GPL; consulte `tools/cartridge-writer/README.md`.

O runtime de desenvolvimento busca essa pasta pelo caminho do aplicativo. O
aplicativo empacotado busca `resources/cartridge-tools/`. O hook `beforePack`
prepara os recursos do sistema de destino; pacotes macOS incluem os dois auxiliares
para permitir os instaladores separados e o fluxo Universal. Variáveis do antigo
atalho STM não são mais lidas.

Em 25/10/2026, a versão de diagnóstico anterior gravou uma ROM de 19.520.304 bytes
pela UI em macOS Apple Silicon e S29GL256 de 32 MiB: ROM relida com SHA-256 idêntico
e quatro leituras de 128 KiB do save idênticas. Esta integração usa o mesmo patch.
Isso não substitui o teste de inicialização, persistência e rumble no console, nem
aprova novos instaladores ou as outras plataformas sem executá-los.

## Regressões

Em `apps/desktop-electron`:

```sh
npm test -- --run src/main/cartridgeWriter.test.ts src/main/cfbTool.test.ts src/main/cartridgeWriterIpc.test.ts src/renderer/CartridgeWriterPanel.test.tsx src/preload/preload.test.ts src/renderer/settingsWorkspace.test.tsx src/shared/studioUiMessages.test.ts src/shared/studioUiCoverage.test.ts
npm run typecheck
npm run build
```

Para uma milestone de produto, execute também `npm run gate:complete-project`,
conforme o [guia de desenvolvimento](../development.md). Confira o fluxo
renderizado com o projeto atual antes de aceitar capturas ou resultados.

Os testes substituem o transporte físico para cobrir a revisão, concorrência,
recusa de ROM/perfil/cartucho incorretos, backup instável, mudança acima de
64 KiB, expiração, confirmação do resultado e verificação independente da ROM.
Há ainda teste de processo sem shell, isolamento das preferências e rejeição
de download adulterado, da origem IPC e dos textos PT/EN/ES. Esses testes não
gravam um cartucho físico.
