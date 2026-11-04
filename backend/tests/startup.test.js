const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

// Runs the real server (`node index.js`) in a child process and collects its output and exit code.
function runServer(env) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, NODE_ENV: 'development', ...env };
    if (env.PORT === undefined) delete childEnv.PORT;
    const child = spawn(process.execPath, ['index.js'], { cwd: path.join(__dirname, '..'), env: childEnv });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const killer = setTimeout(() => child.kill(), 15000); // a server that keeps running fails the test
    child.on('exit', (code) => { clearTimeout(killer); resolve({ code, output }); });
  });
}

// Holds a port so the server cannot bind it. If something else already holds it, that works too.
function holdPort(port) {
  return new Promise((resolve) => {
    const blocker = net.createServer();
    blocker.once('error', () => resolve({ port, close: () => {} }));
    blocker.listen(port, () => resolve({ port: blocker.address().port, close: () => blocker.close() }));
  });
}

describe('server startup', () => {
  test('exits with code 1 and says why when the port is already in use', async () => {
    const held = await holdPort(0);
    try {
      const { code, output } = await runServer({ PORT: String(held.port) });
      expect(output).toMatch(/EADDRINUSE/);
      expect(output).not.toMatch(/Server running/);
      expect(code).toBe(1);
    } finally {
      held.close();
    }
  }, 20000);

  test('uses port 5001 by default (5000 is taken by AirPlay on macOS)', async () => {
    const held = await holdPort(5001);
    try {
      const { code, output } = await runServer({ PORT: undefined });
      expect(output).toMatch(/port 5001/);
      expect(code).toBe(1);
    } finally {
      held.close();
    }
  }, 20000);
});
