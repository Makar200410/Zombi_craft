// Desktop (Windows) wrapper: opens the built game (dist/) in a native window.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#05070d',
    title: 'Zombi Craft',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // F11 fullscreen, F12 devtools
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // diagnostics: page errors go to stdout and to <userData>/zombi-craft.log
  const logFile = path.join(app.getPath('userData'), 'zombi-craft.log');
  const log = (m) => { try { require('fs').appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\n'); } catch (e) { /* ignore */ } console.log(m); };
  win.webContents.on('console-message', (e, level, message, line, src) => { if (level >= 2) log(`[console ${level}] ${message} (${src}:${line})`); });
  win.webContents.on('did-fail-load', (e, code, desc, url) => log(`[load failed] ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (e, d) => log(`[renderer gone] ${d.reason}`));
  win.webContents.on('did-finish-load', () => log('[loaded] ' + win.webContents.getURL()));
  // debug: ZC_SHOT=<file.png> saves a screenshot after ZC_SHOT_DELAY ms and quits (used for automated checks)
  if (process.env.ZC_SHOT) setTimeout(async () => { const img = await win.webContents.capturePage(); require('fs').writeFileSync(process.env.ZC_SHOT, img.toPNG()); log('[shot] ' + process.env.ZC_SHOT); app.quit(); }, +(process.env.ZC_SHOT_DELAY || 20000));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
