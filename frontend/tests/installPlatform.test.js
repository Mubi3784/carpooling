import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatform,
  getInstructions,
  isMobilePlatform,
} from '../src/lib/installPlatform.js';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  crios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  edgios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/123.0.2420.56 Mobile/15E148 Safari/605.1.15',
  fxios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  edge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0.0]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0',
  whatsapp:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.1',
  line:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36 Line/14.0.0',
};

test('iPhone Safari', () => {
  assert.equal(detectPlatform({ userAgent: UA.iphoneSafari, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-safari');
});

test('iPadOS desktop-UA is iOS, real macOS Safari is desktop', () => {
  assert.equal(detectPlatform({ userAgent: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5 }), 'ios-safari');
  assert.equal(detectPlatform({ userAgent: UA.safari, platform: 'MacIntel', maxTouchPoints: 0 }), 'desktop-safari');
});

test('Chrome, Edge and Firefox on iOS are ios-other', () => {
  for (const userAgent of [UA.crios, UA.edgios, UA.fxios]) {
    assert.equal(detectPlatform({ userAgent, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-other');
  }
});

test('Android browsers', () => {
  assert.equal(detectPlatform({ userAgent: UA.androidChrome }), 'android-chrome');
  assert.equal(detectPlatform({ userAgent: UA.samsung }), 'android-other');
  assert.equal(detectPlatform({ userAgent: UA.firefoxAndroid }), 'android-other');
});

test('desktop browsers', () => {
  assert.equal(detectPlatform({ userAgent: UA.chrome, platform: 'Win32' }), 'desktop-chromium');
  assert.equal(detectPlatform({ userAgent: UA.edge, platform: 'Win32' }), 'desktop-chromium');
  assert.equal(detectPlatform({ userAgent: UA.safari, platform: 'MacIntel' }), 'desktop-safari');
  assert.equal(detectPlatform({ userAgent: UA.firefox, platform: 'Win32' }), 'desktop-firefox');
});

test('in-app browsers', () => {
  for (const userAgent of [UA.facebook, UA.instagram, UA.whatsapp, UA.line]) {
    assert.equal(detectPlatform({ userAgent }), 'in-app');
  }
});

test('empty or missing input is other', () => {
  assert.equal(detectPlatform(), 'other');
  assert.equal(detectPlatform({ userAgent: '' }), 'other');
  assert.equal(detectPlatform({ userAgent: 'curl/8.0' }), 'other');
});

test('isMobilePlatform truth table', () => {
  for (const p of ['ios-safari', 'ios-other', 'android-chrome', 'android-other']) {
    assert.equal(isMobilePlatform(p), true);
  }
  for (const p of ['desktop-chromium', 'desktop-safari', 'desktop-firefox', 'in-app', 'other', undefined]) {
    assert.equal(isMobilePlatform(p), false);
  }
});

test('getInstructions shape and honest copy for every platform', () => {
  const all = [
    'ios-safari', 'ios-other', 'android-chrome', 'android-other', 'desktop-chromium',
    'desktop-safari', 'desktop-firefox', 'in-app', 'other',
  ];
  for (const p of all) {
    const { title, steps } = getInstructions(p);
    assert.ok(title.length > 0);
    assert.ok(Array.isArray(steps) && steps.length > 0);
    for (const s of steps) {
      assert.equal(typeof s, 'string');
      assert.ok(!/App Store|Google Play/i.test(s));
    }
  }
  const ff = getInstructions('desktop-firefox').steps.join(' ');
  assert.match(ff, /QR/);
  assert.match(ff, /phone/);
  assert.match(getInstructions('ios-safari').steps.join(' '), /Add to Home Screen/);
  assert.match(getInstructions('in-app').steps.join(' '), /Chrome|Safari/);
});
