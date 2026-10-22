'use strict';

// Keep local test results independent of software that rewrites HTTP CSP headers.
// This is test-only; the application server and production policy stay unchanged.
const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
module.exports = (contents, origin) => {
  contents.session.webRequest.onHeadersReceived({ urls: [`${origin}/*`] }, (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'content-security-policy') delete headers[name];
    headers['Content-Security-Policy'] = [policy];
    callback({ responseHeaders: headers });
  });
};
module.exports.policy = policy;
// AdGuard can also inject its own cross-origin scripts into localhost HTML.
// Their rejection proves the restored policy works; they are not app scripts.
module.exports.isBlockedExternalInjection = message => typeof message === 'string' &&
  message.startsWith("Loading the script 'http://local.adguard.org/") &&
  message.includes('violates the following Content Security Policy directive: "script-src \'self\'"') &&
  message.includes('The action has been blocked.');
