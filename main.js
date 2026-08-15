'use strict';

const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');

const APP_NAME = 'DeepSeek Harness';
const APP_ID = 'com.deepseek.harness.desktop';

let serverProc = null;
let mainWindow = null;
let startupLog = '';

app.setAppUserModelId(APP_ID);

// Remove the default (English) menu bar; keep useful shortcuts registered below.
Menu.setApplicationMenu(null);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(start).catch((err) => {
    dialog.showErrorBox(APP_NAME, '启动失败：' + (err && err.message ? err.message : String(err)));
    app.quit();
  });
}

function resolveNodeExecutable() {
  const candidates = [
    path.join(process.resourcesPath, 'runtime', 'node.exe'), // packaged
    path.join(app.getAppPath(), 'runtime', 'node.exe'),      // dev
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'node';
}

function resolveDshBin() {
  const candidates = [
    path.join(process.resourcesPath, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), // packaged
    path.join(app.getAppPath(), 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), // dev (runtime/)
    path.join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), // dev fallback (root node_modules)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error('后端服务启动超时。\n\n' + (startupLog.trim() || '（无日志输出）')));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.setTimeout(1500, () => req.destroy());
    };
    attempt();
  });
}

function killTree() {
  if (!serverProc) return;
  const pid = serverProc.pid;
  try { serverProc.kill(); } catch (_) { /* ignore */ }
  try {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch (_) { /* ignore */ }
  serverProc = null;
}

async function start() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/`;

  const nodeExecutable = resolveNodeExecutable();
  const dshBin = resolveDshBin();
  const winIcon = path.join(app.getAppPath(), 'build', 'icon.png');

  if (!fs.existsSync(dshBin)) {
    throw new Error('未找到 dsh 后端（' + dshBin + '）。请确认依赖已安装。');
  }

  const home = os.homedir();
  const env = { ...process.env };
  env.DSH_HOME = env.DSH_HOME || path.join(home, '.dsh');
  delete env.ELECTRON_RUN_AS_NODE;

  serverProc = spawn(
    nodeExecutable,
    [dshBin, 'web', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: home,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

  const onData = (chunk) => { startupLog += chunk.toString(); };
  serverProc.stdout.on('data', onData);
  serverProc.stderr.on('data', onData);
  serverProc.on('exit', (code, signal) => {
    serverProc = null;
    console.log('[dsh] exited code=%s signal=%s', code, signal);
  });

  await waitForHttp(url, 90000);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: '#0f1115',
    show: false,
    icon: fs.existsSync(winIcon) ? winIcon : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  // Keep a minimal set of shortcuts now that the menu bar is gone.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const mod = input.control;

    if (mod && input.shift && key === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if (mod && input.shift && key === 'r') {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    } else if (mod && key === 'r') {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (mod && (key === '=' || key === '+')) {
      mainWindow.webContents.setZoomLevel(Math.min(mainWindow.webContents.getZoomLevel() + 0.5, 4));
      event.preventDefault();
    } else if (mod && key === '-') {
      mainWindow.webContents.setZoomLevel(Math.max(mainWindow.webContents.getZoomLevel() - 0.5, -4));
      event.preventDefault();
    } else if (mod && key === '0') {
      mainWindow.webContents.setZoomLevel(0);
      event.preventDefault();
    }
  });

  mainWindow.loadURL(url);
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', killTree);
app.on('will-quit', killTree);
