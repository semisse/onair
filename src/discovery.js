const http = require('http');
const os   = require('os');

const TIMEOUT_MS = 600;

function get(host, path, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port: 80, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(body));
      }
    );
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function testConnection(host) {
  try {
    const body = await get(host, '/ping', TIMEOUT_MS);
    return JSON.parse(body).device === 'onair';
  } catch {
    return false;
  }
}

function localSubnets() {
  const seen = new Set();
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        seen.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  return [...seen];
}

async function scanNetwork(onProgress) {
  // 1. Try mDNS first — instant, no scan needed
  if (await testConnection('onair.local')) return ['onair.local'];

  // 2. Scan all local subnets in batches
  const subnets = localSubnets();
  const found   = [];

  for (const subnet of subnets) {
    const hosts     = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const batchSize = 30;

    for (let i = 0; i < hosts.length; i += batchSize) {
      const batch   = hosts.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async host => ({ host, ok: await testConnection(host) }))
      );
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.ok) found.push(r.value.host); });
      if (onProgress) onProgress(Math.round((i + batchSize) / hosts.length * 100));
    }
  }

  return found;
}

module.exports = { testConnection, scanNetwork };
