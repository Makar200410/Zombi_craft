// Gives the game (renderer) access to desktop-only features: hosting a LAN game.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zcDesktop', {
  isDesktop: true,
  startLan: (port) => ipcRenderer.invoke('lan:start', port),
  stopLan: () => ipcRenderer.invoke('lan:stop'),
});
