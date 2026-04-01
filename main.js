const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const { OnAirState } = require('./src/state');
const { testConnection, scanNetwork } = require('./src/discovery');

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, { electron: process.execPath });
}

const ICON_FRAMES = Array.from({ length: 16 }, (_, i) =>
  path.join(__dirname, 'assets', `icon-on-${i}.png`)
);
const ICON_OFF  = path.join(__dirname, 'assets', 'icon-off.png');
const ICON_TEAL = path.join(__dirname, 'assets', 'icon-teal.png');

const DETECTOR = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'check-mic')
  : path.join(__dirname, 'native', 'check-mic');

const BLE_BRIDGE = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'ble-bridge')
  : path.join(__dirname, 'native', 'ble-bridge');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function getEsp32Host() {
  return readConfig().esp32Host || 'obviouslybusy.local';
}

function getConnectionMode() {
  return readConfig().connectionMode || 'wifi';
}

let tray           = null;
let aboutWindow    = null;
let settingsWindow = null;
let animInterval   = null;
let animFrame      = 0;
let bleBridge      = null;

const state = new OnAirState({ onSignal: (inCall) => {
  sendSignal(inCall);
  updateTray(inCall);
  console.log(inCall ? 'Em chamada — sinal ON' : 'Fora de chamada — sinal OFF');
} });

// --- ESP32 ---

function sendSignal(on) {
  if (getConnectionMode() === 'ble') {
    if (bleBridge) bleBridge.stdin.write(on ? 'on\n' : 'off\n');
  } else {
    const reqPath = on ? '/on' : '/off';
    const req = http.request({ host: getEsp32Host(), port: 80, path: reqPath, method: 'POST' });
    req.on('error', () => {});
    req.end();
  }
}

// --- BLE Bridge ---

function startBleBridge() {
  bleBridge = spawn(BLE_BRIDGE);
  bleBridge.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line === 'connected') {
      console.log('BLE connected — re-sending state');
      sendSignal(state.lastState ?? false);
    }
    console.log('BLE:', line);
  });
  bleBridge.on('exit', () => {
    console.log('BLE bridge terminou — a reiniciar em 2s...');
    bleBridge = null;
    setTimeout(startBleBridge, 2000);
  });
}

function stopBleBridge() {
  if (bleBridge) { bleBridge.kill(); bleBridge = null; }
}

// --- Tray ---

function loadRetina(filePath) {
  const icon = nativeImage.createEmpty();
  icon.addRepresentation({ scaleFactor: 2, width: 44, height: 44, buffer: require('fs').readFileSync(filePath) });
  return icon;
}

function startAnimation() {
  if (animInterval) return;
  animFrame = 0;
  const totalSteps = (ICON_FRAMES.length - 1) * 2;
  animInterval = setInterval(() => {
    const step = animFrame % totalSteps;
    const frameIdx = step < ICON_FRAMES.length ? step : totalSteps - step;
    tray.setImage(loadRetina(ICON_FRAMES[frameIdx]));
    animFrame++;
  }, 120);
}

function stopAnimation() {
  if (animInterval) { clearInterval(animInterval); animInterval = null; }
}

function updateTray(inCall) {
  if (inCall) {
    startAnimation();
  } else {
    stopAnimation();
    tray.setImage(loadRetina(state.manualOverride === null ? ICON_OFF : ICON_TEAL));
  }
  tray.setToolTip(inCall ? 'ObviouslyBusy' : state.manualOverride === null ? 'Auto' : 'Off Air');
}

function menuIcon(filePath) {
  return nativeImage.createFromPath(filePath).resize({ width: 16, height: 16 });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'ObviouslyBusy', enabled: false },
    { type: 'separator' },
    {
      label: 'Busy',
      icon: menuIcon(ICON_FRAMES[0]),
      click: () => { state.setOverride(true);  tray.setContextMenu(buildMenu()); }
    },
    {
      label: 'Free',
      icon: menuIcon(ICON_TEAL),
      click: () => { state.setOverride(false); tray.setContextMenu(buildMenu()); }
    },
    {
      label: 'Auto',
      icon: menuIcon(ICON_OFF),
      enabled: state.manualOverride !== null,
      click: () => { state.setOverride(null);  tray.setContextMenu(buildMenu()); }
    },
    { type: 'separator' },
    { label: 'Settings...', click: () => openSettings() },
    { label: 'About...',    click: () => openAbout() },
    { label: 'Quit',        click: () => app.quit() },
  ]);
}

// --- About window ---

function openAbout() {
  if (aboutWindow) { aboutWindow.focus(); return; }
  aboutWindow = new BrowserWindow({
    width: 400,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'ObviouslyBusy',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#2b2b2b',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  aboutWindow.loadFile(path.join(__dirname, 'windows', 'about.html'), {
    query: { version: app.getVersion() },
  });
  aboutWindow.on('closed', () => { aboutWindow = null; });
}

// --- Settings window ---

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 400,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Settings',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#2b2b2b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'windows', 'settings-preload.js'),
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'windows', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// --- IPC ---

ipcMain.handle('get-config', () => ({ host: getEsp32Host(), mode: getConnectionMode() }));

ipcMain.handle('save-config', (_, { host, mode }) => {
  writeConfig({ ...readConfig(), esp32Host: host, connectionMode: mode });
  if (mode === 'ble') { stopBleBridge(); startBleBridge(); }
  else                { stopBleBridge(); }
});

ipcMain.handle('test-connection', (_, host) => testConnection(host));

ipcMain.handle('scan-network', async (event) => {
  return scanNetwork((pct) => {
    if (!event.sender.isDestroyed()) event.sender.send('scan-progress', pct);
  });
});

// --- Detector ---

let detectorProcess = null;

function startDetector() {
  detectorProcess = spawn(DETECTOR);
  detectorProcess.stdout.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => state.onDetectorEvent(line));
  });
  detectorProcess.on('exit', () => {
    console.log('Detector terminou — a reiniciar em 2s...');
    detectorProcess = null;
    setTimeout(startDetector, 2000);
  });
}

// --- App lifecycle ---

app.whenReady().then(() => {
  app.dock.hide();
  tray = new Tray(loadRetina(ICON_TEAL));
  tray.setContextMenu(buildMenu());
  updateTray(false);
  startDetector();
  if (getConnectionMode() === 'ble') startBleBridge();

  powerMonitor.on('resume', () => {
    if (detectorProcess) detectorProcess.kill();
  });
});

app.on('window-all-closed', () => {});
