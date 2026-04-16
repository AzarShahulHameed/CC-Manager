const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let backendProcess;

function getBackendPath() {
  if (app.isPackaged) {
    // ✅ When running as installed EXE
    return path.join(process.resourcesPath, 'backend', 'server.js');
  } else {
    // ✅ When running in development
    return path.join(__dirname, '..', 'backend', 'server.js');
  }
}

function startBackend() {
  const backendPath = getBackendPath();

  backendProcess = spawn('node', [backendPath], {
    windowsHide: false,   // keep false for now (debug)
    stdio: 'inherit'
  });
}

function waitForBackend(port, callback) {
  const check = () => {
    http
      .get(`http://localhost:${port}/api/health`, res => {
        if (res.statusCode === 200) {
          callback();
        } else {
          setTimeout(check, 500);
        }
      })
      .on('error', () => setTimeout(check, 500));
  };
  check();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'public/logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'build', 'index.html'));
  win.setTitle('CC Manager');
}

app.whenReady().then(() => {
  startBackend();
  waitForBackend(3001, createWindow);
});

app.on('will-quit', () => {
  if (backendProcess) backendProcess.kill();
});