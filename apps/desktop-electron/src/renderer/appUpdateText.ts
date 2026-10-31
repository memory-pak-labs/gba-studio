const pt = {
  title: "Atualizações do GBA Studio", later: "Mais tarde", check: "Verificar atualizações", download: "Baixar atualização",
  restart: "Reiniciar e atualizar", preparing: "Preparando atualização…", checking: "Verificando atualizações…",
  available: "Uma nova versão está disponível", downloaded: "Atualização pronta para instalar", downloading: "Baixando atualização…",
  idle: "Verifique se existe uma nova versão.", current: "Você está usando a versão mais recente deste canal.",
  disabled: "A atualização integrada está disponível no aplicativo instalado por DMG no macOS, instalador no Windows ou AppImage no Linux.",
  error: "Não foi possível concluir a atualização. Verifique a conexão e tente novamente.",
  hint: "Você pode continuar trabalhando durante o download. Antes de reiniciar, vamos verificar se o projeto precisa ser salvo.",
  saveTitle: "Salvar antes de atualizar", saveMessage: "O projeto precisa ser salvo antes de reiniciar. Se o salvamento for cancelado ou falhar, a atualização será adiada.",
  saveRestart: "Salvar e reiniciar", restartMessage: "O projeto está salvo. Deseja reiniciar o GBA Studio para instalar a atualização?",
  savingError: "Não foi possível preparar o projeto para reiniciar. Salve suas alterações e tente novamente."
};
type Text = typeof pt;
const en: Text = {
  title: "GBA Studio updates", later: "Later", check: "Check for updates", download: "Download update",
  restart: "Restart and update", preparing: "Preparing update…", checking: "Checking for updates…",
  available: "A new version is available", downloaded: "Update ready to install", downloading: "Downloading update…",
  idle: "Check for a new version.", current: "You are using the latest version on this channel.",
  disabled: "Integrated updates are available for the installed macOS DMG, Windows installer, or Linux AppImage.",
  error: "The update could not be completed. Check your connection and try again.",
  hint: "You can keep working during the download. We will check whether your project needs saving before restarting.",
  saveTitle: "Save before updating", saveMessage: "Your project must be saved before restarting. If saving is canceled or fails, the update will be postponed.",
  saveRestart: "Save and restart", restartMessage: "Your project is saved. Restart GBA Studio to install the update?",
  savingError: "Could not prepare your project for restart. Save your changes and try again."
};
const es: Text = {
  title: "Actualizaciones de GBA Studio", later: "Más tarde", check: "Buscar actualizaciones", download: "Descargar actualización",
  restart: "Reiniciar y actualizar", preparing: "Preparando actualización…", checking: "Buscando actualizaciones…",
  available: "Hay una nueva versión disponible", downloaded: "Actualización lista para instalar", downloading: "Descargando actualización…",
  idle: "Busca una nueva versión.", current: "Estás usando la versión más reciente de este canal.",
  disabled: "La actualización integrada está disponible en la aplicación instalada por DMG en macOS, instalador en Windows o AppImage en Linux.",
  error: "No se pudo completar la actualización. Revisa la conexión e inténtalo de nuevo.",
  hint: "Puedes seguir trabajando durante la descarga. Antes de reiniciar, comprobaremos si necesitas guardar el proyecto.",
  saveTitle: "Guardar antes de actualizar", saveMessage: "Debes guardar el proyecto antes de reiniciar. Si cancelas o falla el guardado, la actualización se aplazará.",
  saveRestart: "Guardar y reiniciar", restartMessage: "Tu proyecto está guardado. ¿Reiniciar GBA Studio para instalar la actualización?",
  savingError: "No se pudo preparar el proyecto para reiniciar. Guarda los cambios e inténtalo de nuevo."
};
export function appUpdateText(locale: string): Text {
  return locale === "pt-BR" ? pt : locale.startsWith("es") ? es : en;
}
