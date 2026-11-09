'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shortageDesktop', {
  load: () => ipcRenderer.invoke('data:load'),
  save: text => ipcRenderer.invoke('data:save', text),
  backup: text => ipcRenderer.invoke('data:backup', text),
  chooseBackup: () => ipcRenderer.invoke('data:choose-backup'),
  recover: text => ipcRenderer.invoke('data:recover', text),
  folder: () => ipcRenderer.invoke('data:folder'),
  clipboard: () => ipcRenderer.invoke('clipboard:read'),
  onClose: callback => ipcRenderer.on('app:closing', async () => {
    try { await callback(); ipcRenderer.send('app:close-ready'); }
    catch (error) { ipcRenderer.send('app:close-failed', String(error.message || error)); }
  }),
});
