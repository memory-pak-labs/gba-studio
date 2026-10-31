import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from "electron";
import { ipcChannels, type AppCommand } from "../shared/ipc.js";
import { translateStudioMessage } from "../shared/studioUiMessages.js";
import { DEFAULT_APP_LOCALE } from "../shared/appLocale.js";

interface AppMenuOptions {
  locale?: string;
  appName?: string;
  isMac?: boolean;
  sendCommand(command: AppCommand): void;
}

function fileMenu(sendCommand: (command: AppCommand) => void): MenuItemConstructorOptions {
  return {
    label: "Arquivo",
    submenu: [
      {
        accelerator: "CmdOrCtrl+O",
        click: () => sendCommand("project:open"),
        label: "Abrir projeto..."
      },
      {
        label: "Abrir recentes",
        role: "recentDocuments",
        submenu: [
          {
            label: "Limpar recentes",
            role: "clearRecentDocuments"
          }
        ]
      },
      {
        accelerator: "CmdOrCtrl+S",
        click: () => sendCommand("project:save"),
        label: "Salvar"
      },
      {
        accelerator: "Shift+CmdOrCtrl+S",
        click: () => sendCommand("project:save-as"),
        label: "Salvar como..."
      },
      { type: "separator" },
      {
        accelerator: "CmdOrCtrl+E",
        click: () => sendCommand("engine:export"),
        label: "Export Engine"
      },
      {
        accelerator: "CmdOrCtrl+B",
        click: () => sendCommand("project:play"),
        label: "Play Window"
      },
      {
        accelerator: "Shift+CmdOrCtrl+B",
        click: () => sendCommand("project:export-rom"),
        label: "Exportar ROM .gba"
      },
      { type: "separator" },
      { label: "Fechar", role: "close", accelerator: "CmdOrCtrl+W" },
      { label: "Sair", role: "quit" }
    ]
  };
}

export function createAppMenuTemplate(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const isMac = options.isMac ?? process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: options.appName ?? app.name,
      submenu: [
        { label: "Sobre GBA Studio", role: "about" },
        { type: "separator" },
        { label: "Servicos", role: "services" },
        { type: "separator" },
        { label: "Ocultar GBA Studio", role: "hide" },
        { label: "Ocultar outros", role: "hideOthers" },
        { label: "Mostrar tudo", role: "unhide" },
        { type: "separator" },
        { label: "Sair", role: "quit" }
      ]
    });
  }

  template.push({
    label: "Projeto",
    submenu: [
      {
        click: () => options.sendCommand("project:install-plugin"),
        label: "Instalar plugin..."
      },
      {
        click: () => options.sendCommand("project:plugin-catalog"),
        label: "Catalogo de plugins..."
      }
    ]
  });
  template.push(fileMenu(options.sendCommand));
  template.push({
    label: "Editar",
    submenu: [
      {
        accelerator: "CmdOrCtrl+Z",
        click: () => options.sendCommand("edit:undo"),
        label: "Desfazer"
      },
      {
        accelerator: "Shift+CmdOrCtrl+Z",
        click: () => options.sendCommand("edit:redo"),
        label: "Refazer"
      },
      { type: "separator" },
      { label: "Recortar", role: "cut" },
      { label: "Copiar", role: "copy" },
      { label: "Colar", role: "paste" },
      { label: "Selecionar tudo", role: "selectAll" }
    ]
  });
  template.push({
    label: "Visualizar",
    submenu: [
      { label: "Recarregar", role: "reload" },
      { label: "Alternar DevTools", role: "toggleDevTools" },
      { type: "separator" },
      { label: "Tela cheia", role: "togglefullscreen" }
    ]
  });

  template.push({
    label: "Ajuda",
    submenu: [{ label: "Verificar atualizações...", click: () => options.sendCommand("app:check-updates") }]
  });

  const localize = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] => items.map(item => ({
    ...item,
    ...(item.label && item.label !== options.appName ? { label: translateStudioMessage(options.locale ?? DEFAULT_APP_LOCALE, item.label) } : {}),
    ...(Array.isArray(item.submenu) ? { submenu: localize(item.submenu) } : {})
  }));
  return localize(template);
}

type AppMenuTarget = Pick<BrowserWindow, "isDestroyed" | "isMinimized" | "restore" | "show" | "focus"> & {
  webContents: Pick<WebContents, "send">;
};

export function dispatchAppMenuCommand(target: AppMenuTarget | undefined, command: AppCommand): void {
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
  target.webContents.send(ipcChannels.appCommand, command);
}

export function installAppMenu(locale: string = DEFAULT_APP_LOCALE, getEditorWindow: () => BrowserWindow | undefined = () => undefined): void {
  const sendCommand = (command: AppCommand): void => {
    dispatchAppMenuCommand(getEditorWindow(), command);
  };

  Menu.setApplicationMenu(Menu.buildFromTemplate(createAppMenuTemplate({ sendCommand, locale })));
}
