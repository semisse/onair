const { app, Tray, Menu, nativeImage, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, { electron: process.execPath });
}

const ICON_FRAMES = Array.from({ length: 16 }, (_, i) =>
  path.join(__dirname, 'assets', `icon-on-${i}.png`)
);
const ICON_OFF  = path.join(__dirname, 'assets', 'icon-off.png');
const ICON_TEAL = path.join(__dirname, 'assets', 'icon-teal.png');

const DETECTOR  = path.join(__dirname, 'native', 'check-mic');
const ESP32_IP  = '192.168.1.100'; // configurar com o IP do ESP32

let tray          = null;
let aboutWindow   = null;
let lastState     = null;
let detectorState = false; // último estado reportado pelo detector
let manualOverride = null; // null = automático, true/false = forçado
let animInterval  = null;
let animFrame     = 0;

// --- ESP32 ---

function sendSignal(on) {
  const reqPath = on ? '/on' : '/off';
  const req = http.request({ host: ESP32_IP, port: 80, path: reqPath, method: 'POST' });
  req.on('error', () => {}); // silencioso — ESP32 pode não estar disponível ainda
  req.end();
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
  }, 120); // ~8fps
}

function stopAnimation() {
  if (animInterval) { clearInterval(animInterval); animInterval = null; }
}

function updateTray(inCall) {
  if (inCall) {
    startAnimation();
  } else {
    stopAnimation();
    tray.setImage(loadRetina(manualOverride === null ? ICON_OFF : ICON_TEAL));
  }
  tray.setToolTip(inCall ? 'On Air' : manualOverride === null ? 'Auto' : 'Off Air');
}

function menuIcon(filePath) {
  return nativeImage.createFromPath(filePath).resize({ width: 16, height: 16 });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'On Air', enabled: false },
    { type: 'separator' },
    {
      label: 'Turn On Air',
      icon: menuIcon(ICON_FRAMES[0]),
      click: () => { manualOverride = true;  applyState(true);  tray.setContextMenu(buildMenu()); }
    },
    {
      label: 'Turn Off Air',
      icon: menuIcon(ICON_TEAL),
      click: () => { manualOverride = false; applyState(false); tray.setContextMenu(buildMenu()); }
    },
    {
      label: 'Auto',
      icon: menuIcon(ICON_OFF),
      enabled: manualOverride !== null,
      click: () => { manualOverride = null; applyState(detectorState); updateTray(lastState); tray.setContextMenu(buildMenu()); }
    },
    { type: 'separator' },
    { label: 'About...', click: () => openAbout() },
    { label: 'Quit',  click: () => app.quit() },
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
    title: 'On Air',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#2b2b2b',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  aboutWindow.loadFile(path.join(__dirname, 'windows', 'about.html'), {
    query: { version: app.getVersion() },
  });
  aboutWindow.on('closed', () => { aboutWindow = null; });
}

// --- State ---

function applyState(inCall) {
  if (inCall !== lastState) {
    lastState = inCall;
    sendSignal(inCall);
    updateTray(inCall);
    console.log(inCall ? 'Em chamada — sinal ON' : 'Fora de chamada — sinal OFF');
  }
}

// --- Detector (event-driven, persistent process) ---

function startDetector() {
  const detector = spawn(DETECTOR);

  detector.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      detectorState = line === 'in_call';
      if (manualOverride === null) applyState(detectorState);
    }
  });

  detector.on('exit', () => {
    console.log('Detector terminou — a reiniciar em 2s...');
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
});

app.on('window-all-closed', () => {}); // manter vivo sem janelas
