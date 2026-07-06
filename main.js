// main.js
// Electron main process for RPG Maker Galaga.
// Responsible for creating the app window, wiring up native menus (which NVDA
// reads natively as standard OS menu items), and handling file I/O for
// project save/load so the renderer never has to touch the filesystem directly.

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'RPG Maker Galaga',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Build a native application menu. Native menus are automatically
  // accessible to NVDA/JAWS via standard Win32 menu APIs, unlike custom
  // in-page menu bars, so we prefer this for top-level navigation.
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu:new-project') },
        { label: 'Open Project', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu:open-project') },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu:save-project') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow.webContents.send('menu:redo') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Map Editor', click: () => mainWindow.webContents.send('menu:view', 'map') },
        { label: 'Database', click: () => mainWindow.webContents.send('menu:view', 'database') },
        { label: 'Event Editor', click: () => mainWindow.webContents.send('menu:view', 'events') },
        { label: 'AI Assistant', click: () => mainWindow.webContents.send('menu:view', 'ai') },
      ],
    },
    {
      label: 'Accessibility',
      submenu: [
        {
          label: 'Announce Current Map Summary',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow.webContents.send('a11y:announce-map-summary'),
        },
        {
          label: 'Read Selected Event Aloud',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow.webContents.send('a11y:read-event'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- File I/O handlers ----
// The renderer requests these via ipcRenderer.invoke(...) exposed in preload.js.

ipcMain.handle('project:save', async (event, projectData) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save RPG Maker Galaga Project',
    defaultPath: 'MyProject.rmgproj.json',
    filters: [{ name: 'RPG Maker Galaga Project', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf-8');
  return { ok: true, filePath };
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open RPG Maker Galaga Project',
    properties: ['openFile'],
    filters: [{ name: 'RPG Maker Galaga Project', extensions: ['json'] }],
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  const raw = fs.readFileSync(filePaths[0], 'utf-8');
  return { ok: true, filePath: filePaths[0], data: JSON.parse(raw) };
});

ipcMain.handle('project:load-sample', async () => {
  const samplePath = path.join(__dirname, '..', 'data', 'sample-project.json');
  const raw = fs.readFileSync(samplePath, 'utf-8');
  return { ok: true, data: JSON.parse(raw) };
});
