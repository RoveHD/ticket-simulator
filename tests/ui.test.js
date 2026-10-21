'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer() {
  const context = vm.createContext({
    document: { querySelector: () => ({}), addEventListener() {} },
    window: { addEventListener() {} },
    fetch: () => new Promise(() => {}),
  });
  for (const file of ['menu.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', file), 'utf8'), context);
  return text => { context.input = text; return vm.runInContext('markdown(input)', context); };
}

test('legacy Windows Markdown renders headings, tables and fenced commands', () => {
  const html = renderer()('\uFEFF# Bericht\r\n\r\n## Bewertung\r\n| Kategorie | Punkte |\r\n|---|---|\r\n| Diagnose | 20 |\r\n\r\n```powershell\r\nipconfig /all\r\n```\r\n');
  assert.match(html, /<h1>Bericht<\/h1>/);
  assert.match(html, /<h2>Bewertung<\/h2>/);
  assert.match(html, /<td>Diagnose<\/td><td>20<\/td>/);
  assert.match(html, /<pre><code>ipconfig \/all<\/code><\/pre>/);
  assert.doesNotMatch(html, /<td>---/);
});

test('AI report HTML and executable links remain inert text', () => {
  const html = renderer()('<img src=x onerror="alert(1)">\n<script>alert(1)</script>\n[Link](javascript:alert(1))\n```\n</code><script>alert(2)</script>\n```');
  assert.doesNotMatch(html, /<(?:img|script|a)\b/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;\/code&gt;&lt;script&gt;/);
});
