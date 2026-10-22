'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const strictCsp = require('./strict-csp.cjs');

test('desktop test policy matches the application server without allowing inline styles', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-csp-'));
  const app = require('../server').createApp({ root: path.resolve(__dirname, '..'), dataDir: directory,
    authCheck: async () => ({ available: false }) });
  // Observe what this server emits before local filtering software can rewrite it.
  let emittedPolicy;
  app.server.prependListener('request', (_request, response) => {
    const writeHead = response.writeHead;
    response.writeHead = function(...args) {
      const headers = typeof args[1] === 'string' ? args[2] : args[1];
      emittedPolicy = headers?.['Content-Security-Policy'];
      return writeHead.apply(this, args);
    };
  });
  t.after(async () => { await app.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await app.ready; await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}`);
  assert.equal(emittedPolicy, strictCsp.policy);
  assert.ok(strictCsp.policy.includes("style-src 'self';"));
  assert.ok(!strictCsp.policy.includes('unsafe-inline'));
  await response.arrayBuffer();
});

test('CSP test diagnostics exclude only explicitly blocked external AdGuard injections', () => {
  const suffix = ` violates the following Content Security Policy directive: "script-src 'self'". The action has been blocked.`;
  assert.equal(strictCsp.isBlockedExternalInjection("Loading the script 'http://local.adguard.org/?type=content-script'" + suffix), true);
  for (const message of [undefined, 'Application error', "Loading the script 'http://127.0.0.1/app.js'" + suffix,
    "Loading the script 'http://local.adguard.org/?type=content-script' failed to load",
    'Inline style was blocked', 'Application error referencing http://local.adguard.org/']) {
    assert.equal(strictCsp.isBlockedExternalInjection(message), false);
  }
});
