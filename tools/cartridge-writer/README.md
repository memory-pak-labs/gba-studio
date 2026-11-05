# Auxiliar externo de gravação

O GBA Studio invoca o executável `cfb` como processo independente. O código do
editor permanece separado do componente GPL. O patch desta pasta modifica
somente o auxiliar: `--no-power-control` omite os pacotes `0xa0` que o firmware
STM não implementa, mantendo o comportamento upstream sem essa opção.

- Origem: https://github.com/eyenobig/chis-burner-cmd
- Commit: `8b3eb46d639221f3093ae2b5646fdf9d91fa7999` (`v0.5.2`).
- Submódulo `chis-burner-rule`: `77836dd40abd1bf5e9751f5c3e27dbe77703915e`.
- Licença do auxiliar e patch: **GPL-3.0-only**, texto integral em `COPYING`.
- Receita e checksums: `apps/desktop-electron/scripts/cfb-support-source.json`.

Em `apps/desktop-electron`, `npm run prepare:cartridge-tools` cria um checkout
isolado, verifica os commits e o patch, executa os testes Rust e compila com
`Cargo.lock`. O resultado inclui executável, licença, manifesto e um arquivo das
fontes correspondentes (com o patch aplicado, submódulo e instrução de origem).
O usuário final recebe esses recursos com o aplicativo; não instala Rust.

Os recursos são gerados sob `build/cartridge-tools`, ignorados pelo Git. Não
copie executáveis de QA para esta pasta de fontes nem substitua um hash do
upstream por um binário modificado. Novas distribuições exigem validar a licença,
os recursos efetivamente incluídos, assinatura, plataforma e fluxo de gravação.
