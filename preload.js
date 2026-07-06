// preload.js
// Exposes a small, safe API surface to the renderer (contextIsolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galaga', {
  // File operations
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  openProject: () => ipcRenderer.invoke('project:open'),
  loadSampleProject: () => ipcRenderer.invoke('project:load-sample'),

  // Menu / accessibility event subscriptions
  onMenu: (channel, callback) => ipcRenderer.on(channel, (_event, ...args) => callback(...args)),
});
