import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('push-handler.js has push + notificationclick, URL guard, no fetch handling', () => {
  const t = read('../public/push-handler.js');
  assert.match(t, /addEventListener\(\s*'push'/);
  assert.match(t, /addEventListener\(\s*'notificationclick'/);
  assert.ok(t.includes('showNotification'));
  assert.ok(t.includes("startsWith('/')"));
  assert.ok(!/addEventListener\(\s*'fetch'/.test(t));
});

const distSw = new URL('../dist/sw.js', import.meta.url);

test('built sw.js imports push handler and keeps NetworkOnly /api/', { skip: !fs.existsSync(distSw) && 'dist not built' }, () => {
  const t = fs.readFileSync(distSw, 'utf8');
  assert.ok(t.includes('push-handler.js'));
  assert.ok(t.includes('importScripts'));
  assert.ok(t.includes('NetworkOnly'));
  assert.ok(t.includes('index.html'));
  assert.ok(fs.existsSync(new URL('../dist/push-handler.js', import.meta.url)));
});
