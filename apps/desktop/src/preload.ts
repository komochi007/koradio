import { contextBridge, ipcRenderer } from "electron";

import type { MenuBarCommand, MenuBarPlayback } from "./menu-bar.js";

let pendingMenuBarPlaybackRequest = false;
let latestMenuBarPlayback: MenuBarPlayback | undefined;

ipcRenderer.on("koradio:menu-bar-request-playback", () => {
  if (latestMenuBarPlayback !== undefined) {
    ipcRenderer.send("koradio:menu-bar-playback", latestMenuBarPlayback);
    return;
  }
  pendingMenuBarPlaybackRequest = true;
});

contextBridge.exposeInMainWorld("koradioDesktop", {
  onMenuBarPlaybackRequested(listener: () => void): () => void {
    if (pendingMenuBarPlaybackRequest) {
      pendingMenuBarPlaybackRequest = false;
      listener();
    }
    const receive = (): void => {
      pendingMenuBarPlaybackRequest = false;
      listener();
    };
    ipcRenderer.on("koradio:menu-bar-request-playback", receive);
    return () => ipcRenderer.removeListener("koradio:menu-bar-request-playback", receive);
  },
  onMenuBarCommand(listener: (command: MenuBarCommand) => void): () => void {
    const receive = (_event: Electron.IpcRendererEvent, command: MenuBarCommand): void => {
      listener(command);
    };
    ipcRenderer.on("koradio:menu-bar-command", receive);
    return () => ipcRenderer.removeListener("koradio:menu-bar-command", receive);
  },
  publishMenuBarPlayback(playback: MenuBarPlayback): void {
    latestMenuBarPlayback = playback;
    ipcRenderer.send("koradio:menu-bar-playback", playback);
  },
});

ipcRenderer.send("koradio:menu-bar-ready");
