const http = require('http');
const os   = require('os');

jest.mock('http');
jest.mock('os');

const { testConnection, scanNetwork } = require('../src/discovery');

beforeEach(() => jest.clearAllMocks());

// --- Helpers ---

function mockRequest({ body, error, timeout } = {}) {
  const req = {
    setTimeout: jest.fn((_, cb) => { if (timeout) cb(); }),
    on:         jest.fn((event, cb) => { if (event === 'error' && error) cb(error); }),
    end:        jest.fn(),
    destroy:    jest.fn(),
  };

  http.request.mockImplementation((_, callback) => {
    if (!error && !timeout) {
      const res = {
        on: jest.fn((event, cb) => {
          if (event === 'data') cb(body);
          if (event === 'end')  cb();
        }),
      };
      callback(res);
    }
    return req;
  });
}

function mockSubnet(subnet = '192.168.1') {
  os.networkInterfaces.mockReturnValue({
    en0: [{ family: 'IPv4', internal: false, address: `${subnet}.10` }],
  });
}

// --- testConnection ---

describe('testConnection', () => {
  test('returns true when ESP32 responds with correct device id', async () => {
    mockRequest({ body: '{"device":"obviouslybusy"}' });
    expect(await testConnection('192.168.1.50')).toBe(true);
  });

  test('returns false when device id does not match', async () => {
    mockRequest({ body: '{"device":"other"}' });
    expect(await testConnection('192.168.1.50')).toBe(false);
  });

  test('returns false on network error', async () => {
    mockRequest({ error: new Error('ECONNREFUSED') });
    expect(await testConnection('192.168.1.50')).toBe(false);
  });

  test('returns false on timeout', async () => {
    mockRequest({ timeout: true });
    expect(await testConnection('192.168.1.50')).toBe(false);
  });

  test('returns false on invalid JSON response', async () => {
    mockRequest({ body: 'not json' });
    expect(await testConnection('192.168.1.50')).toBe(false);
  });
});

// --- scanNetwork ---

describe('scanNetwork', () => {
  test('returns onair.local immediately if mDNS responds', async () => {
    mockRequest({ body: '{"device":"obviouslybusy"}' });
    mockSubnet();
    const found = await scanNetwork();
    expect(found).toEqual(['obviouslybusy.local']);
    // Should not scan the subnet — only one request made (mDNS)
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  test('falls back to subnet scan and finds device', async () => {
    const TARGET = '192.168.1.42';
    mockSubnet('192.168.1');

    http.request.mockImplementation((opts, callback) => {
      const req = {
        setTimeout: jest.fn(),
        on:         jest.fn(),
        end:        jest.fn(),
        destroy:    jest.fn(),
      };
      const body = opts.host === TARGET || opts.host === 'onair.local' && false
        ? '{"device":"obviouslybusy"}'
        : '{"device":"other"}';
      // mDNS fails, only TARGET responds correctly
      const responds = opts.host === TARGET;
      if (responds) {
        const res = { on: jest.fn((e, cb) => { if (e === 'data') cb(body); if (e === 'end') cb(); }) };
        callback(res);
      } else {
        req.on.mockImplementation((e, cb) => { if (e === 'error') cb(new Error('ECONNREFUSED')); });
      }
      return req;
    });

    const found = await scanNetwork();
    expect(found).toContain(TARGET);
  });

  test('returns empty array when nothing responds', async () => {
    mockSubnet('192.168.1');
    mockRequest({ error: new Error('ECONNREFUSED') });
    const found = await scanNetwork();
    expect(found).toEqual([]);
  });

  test('reports progress during scan', async () => {
    mockSubnet('192.168.1');
    mockRequest({ error: new Error('ECONNREFUSED') });
    const progress = [];
    await scanNetwork(pct => progress.push(pct));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBeGreaterThanOrEqual(100);
  });
});
