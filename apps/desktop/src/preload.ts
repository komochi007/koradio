import { contextBridge, ipcRenderer } from "electron";

import type { MenuBarCommand, MenuBarPlayback } from "./menu-bar.js";

contextBridge.exposeInMainWorld("koradioDesktop", {
  onMenuBarCommand(listener: (command: MenuBarCommand) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, command: MenuBarCommand): void => {
      listener(command);
    };
    ipcRenderer.on("koradio:menu-bar-command", receive);
    return () => ipcRenderer.removeListener("koradio:menu-bar-command", receive);
  },
  publishMenuBarPlayback(playback: MenuBarPlayback): void {
    ipcRenderer.send("koradio:menu-bar-playback", playback);
  },
});
