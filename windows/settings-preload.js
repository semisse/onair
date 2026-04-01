const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:      ()     => ipcRenderer.invoke('get-config'),
  saveConfig:     (cfg)  => ipcRenderer.invoke('save-config', cfg),
  testConnection: (host) => ipcRenderer.invoke('test-connection', host),
  scanNetwork:    ()     => ipcRenderer.invoke('scan-network'),
  onScanProgress: (cb)   => ipcRenderer.on('scan-progress', (_, pct) => cb(pct)),
});
