const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:      ()     => ipcRenderer.invoke('get-config'),
  saveConfig:     (host) => ipcRenderer.invoke('save-config', host),
  testConnection: (host) => ipcRenderer.invoke('test-connection', host),
  scanNetwork:    ()     => ipcRenderer.invoke('scan-network'),
  onScanProgress: (cb)   => ipcRenderer.on('scan-progress', (_, pct) => cb(pct)),
});
