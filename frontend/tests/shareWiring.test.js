import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('share button is wired into all six surfaces', () => {
  for (const f of [
    'components/RideCard.jsx', 'components/RequestCard.jsx', 'components/MyRidesList.jsx',
    'components/MyRequestsList.jsx', 'pages/RideDetails.jsx', 'pages/RequestDetails.jsx',
  ]) {
    const src = read(f);
    assert.match(src, /import ShareWhatsAppButton/, f);
    assert.match(src, /<ShareWhatsAppButton /, f);
  }
});

test('/requests/:id is a protected route', () => {
  assert.match(read('App.jsx'), /path="\/requests\/:id" element=\{<ProtectedRoute><RequestDetails \/><\/ProtectedRoute>\}/);
});

test('ShareWhatsAppButton prevents default and stops propagation, with 44px target and label', () => {
  const src = read('components/ShareWhatsAppButton.jsx');
  assert.match(src, /e\.preventDefault\(\)/);
  assert.match(src, /e\.stopPropagation\(\)/);
  assert.match(src, /min-h-\[44px\]/);
  assert.match(src, /aria-label/);
});

test('RideCard keeps the share button outside the anchor', () => {
  const src = read('components/RideCard.jsx');
  assert.ok(src.indexOf('</Link>') < src.indexOf('<ShareWhatsAppButton'));
});

test('unavailable listings use the shared card; auth pages honor the saved route', () => {
  assert.ok(read('components/ListingUnavailable.jsx').includes('Listing Expired or Unavailable'));
  assert.match(read('pages/RideDetails.jsx'), /ListingUnavailable/);
  assert.match(read('pages/RequestDetails.jsx'), /ListingUnavailable/);
  for (const f of ['pages/Login.jsx', 'pages/Register.jsx']) {
    assert.match(read(f), /resolvePostAuthTarget\(from\)/, f);
    assert.match(read(f), /state=\{location\.state\}/, f);
  }
  assert.match(read('pages/RideDetails.jsx'), /state=\{\{ from: location \}\}/);
});
