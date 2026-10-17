import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toSafeUser } from '../src/utils/safeUser.js';

test('toSafeUser keeps only id, name, role', () => {
  const u = toSafeUser({ id: 'a1', name: 'Sam', role: 'user', email: 'x@y.z', phone: '123', whatsapp: '1', token: 't' });
  assert.deepEqual(u, { id: 'a1', name: 'Sam', role: 'user' });
});

test('toSafeUser returns null without id or non-object', () => {
  assert.equal(toSafeUser({ name: 'x' }), null);
  assert.equal(toSafeUser(null), null);
  assert.equal(toSafeUser('x'), null);
});

test('AuthContext uses toSafeUser and holds no email/phone', () => {
  const src = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('toSafeUser'));
  assert.ok(!/user\??\.(email|phone)/.test(src));
  assert.ok(!/setUser\((res|receivedUser)/.test(src));
});

test('no page reads user.phone / user.email / whatsappLink', () => {
  const dir = new URL('../src/', import.meta.url);
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : [new URL(e.name, d)]
    );
  for (const f of walk(dir).filter((u) => /\.jsx?$/.test(u.pathname))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/user\??\.(phone|email)\b/.test(t), `${f.pathname} reads user phone/email`);
    assert.ok(!/whatsappLink/.test(t), `${f.pathname} uses whatsappLink`);
  }
});
