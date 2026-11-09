'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { Store, validate, atomicWrite, MAX_BYTES } = require('./store.cjs');
app.setName('Shortage');
app.commandLine.appendSwitch('disable-background-networking');
if (process.platform === 'win32') app.setAppUserModelId('cz.ecko456.shortage');
let win, store, closing = false;
const root = path.resolve(__dirname, '..', 'app');
if (process.env.SHORTAGE_TEST_DATA_DIR) app.setPath('userData', process.env.SHORTAGE_TEST_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    store = new Store(app.getPath('userData'));
    // Aplikace používá pouze přibalené soubory. Síť zůstává vypnutá i při zapnutém internetu.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      let allowed = /^(data|blob):/.test(details.url);
      if (details.url.startsWith('file:')) {
        try { const file = path.resolve(fileURLToPath(details.url)); allowed = file.startsWith(root + path.sep); } catch {}
      }
      callback({ cancel: !allowed });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({ width: 1500, height: 960, minWidth: 900, minHeight: 600, show: false, title: 'Shortage',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false } });
    const trusted = event => { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Neplatný požadavek.'); };
    const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => { trusted(event); return fn(...args); });
    handle('data:load', () => store.load());
    handle('data:save', text => store.save(text));
    handle('data:recover', text => store.save(text, { recovery: true }));
    handle('data:backup', async text => {
      validate(text);
      const result = await dialog.showSaveDialog(win, { title: 'Záloha Shortage', defaultPath: `shortage-zaloha-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'Záloha Shortage', extensions: ['json'] }] });
      if (result.canceled) return false;
      await atomicWrite(result.filePath, text);
      return true;
    });
    handle('data:choose-backup', async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Obnovit zálohu Shortage', properties: ['openFile'], filters: [{ name: 'Záloha Shortage', extensions: ['json'] }] });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > MAX_BYTES) throw new Error('Záloha je příliš velká (nejvýš 32 MB).');
      const text = await fs.readFile(file, 'utf8');
      validate(text);
      return text;
    });
    handle('data:folder', async () => { const error = await shell.openPath(store.dir); if (error) throw new Error(error); });
    handle('clipboard:read', async () => {
      const values={html:'',text:''};
      for(const item of await clipboard.read()){
        for(const [mime,key] of [['text/html','html'],['text/plain','text']]){
          if(!values[key]&&item.types.includes(mime)){
            const blob=await item.getType(mime);
            if(blob.size>MAX_BYTES)throw new Error('Tabulka ve schránce je příliš velká. Použij Nahrát Excel.');
            values[key]=await blob.text();
          }
        }
      }
      const {html,text}=values;
      if(Buffer.byteLength(html)+Buffer.byteLength(text)>MAX_BYTES)throw new Error('Tabulka ve schránce je příliš velká. Použij Nahrát Excel.');
      return {html,text};
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('close', event => { if (!closing) { event.preventDefault(); win.webContents.send('app:closing'); } });
    ipcMain.on('app:close-ready', event => { trusted(event); closing = true; win.close(); });
    ipcMain.on('app:close-failed', async (event, reason) => {
      trusted(event);
      const result = await dialog.showMessageBox(win, { type: 'error', title: 'Změny se nepodařilo uložit', message: 'Aplikace zůstává otevřená, aby se změny neztratily.', detail: String(reason).slice(0,500), buttons: ['Zůstat v aplikaci', 'Zavřít bez uložení'], defaultId: 0, cancelId: 0 });
      if (result.response === 1) { closing = true; win.close(); }
    });
    await win.loadFile(path.join(root, 'index.html'));
    win.show();
  });
  app.on('window-all-closed', () => app.quit());
}
