// Pure platform detection + install instructions. No DOM access at import time.

const IN_APP_RE =
  /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|musical_ly|BytedanceWebview|; wv\)/i;

export function detectPlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return 'other';

  if (IN_APP_RE.test(ua)) return 'in-app';

  const isIos =
    /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && Number(maxTouchPoints) > 1);
  if (isIos) {
    return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? 'ios-other' : 'ios-safari';
  }

  if (/Android/i.test(ua)) {
    const chromeLike = /Chrome\//i.test(ua) && !/SamsungBrowser|Firefox|OPR\/|EdgA|Edg\//i.test(ua);
    return chromeLike ? 'android-chrome' : 'android-other';
  }

  if (/Edg\/|Chrome\/|Chromium|OPR\//i.test(ua)) return 'desktop-chromium';
  if (/Firefox\//i.test(ua)) return 'desktop-firefox';
  if (/Safari\//i.test(ua)) return 'desktop-safari';
  return 'other';
}

export function isMobilePlatform(platform) {
  return typeof platform === 'string' && (platform.startsWith('ios-') || platform.startsWith('android-'));
}

export function isDesktopPlatform(platform) {
  return typeof platform === 'string' && platform.startsWith('desktop-');
}

const INSTRUCTIONS = {
  'ios-safari': {
    title: 'Add Carpooling to your Home Screen',
    steps: [
      'Tap the Share button in Safari.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" to confirm.',
    ],
  },
  'ios-other': {
    title: 'Add Carpooling to your Home Screen',
    steps: [
      'Tap the Share button in your browser (iOS 16.4 or later is required for browsers other than Safari).',
      'Choose "Add to Home Screen" and tap "Add".',
      'If you do not see that option, open this page in Safari and repeat the steps.',
    ],
  },
  'android-chrome': {
    title: 'Install Carpooling on your phone',
    steps: [
      'Tap the browser menu (three dots).',
      'Choose "Install app" or "Add to Home screen".',
      'Confirm to add Carpooling to your home screen.',
    ],
  },
  'android-other': {
    title: 'Install Carpooling on your phone',
    steps: [
      'Open your browser menu.',
      'Choose "Install app" or "Add to Home screen".',
      'If you do not see it, open this page in Chrome and try again.',
    ],
  },
  'desktop-chromium': {
    title: 'Install Carpooling on this computer',
    steps: [
      'Look for the install icon at the right end of the address bar and click it.',
      'Or open the browser menu and choose "Install Carpooling" (under Cast, save and share in Chrome).',
      'Confirm to install.',
    ],
  },
  'desktop-safari': {
    title: 'Add Carpooling to your Dock',
    steps: [
      'On macOS Sonoma (14) or later, open the File menu in Safari.',
      'Choose "Add to Dock".',
    ],
  },
  'desktop-firefox': {
    title: 'Use Carpooling on your phone',
    steps: [
      'Firefox on desktop cannot install web apps.',
      'Scan the QR code with your phone camera to open Carpooling there.',
      'On your phone, choose "Add to Home Screen" or "Install".',
    ],
  },
  'in-app': {
    title: 'Open in your browser to install',
    steps: [
      'This in-app browser cannot install Carpooling.',
      'Open the menu and choose "Open in Chrome" or "Open in Safari".',
      'Then use "Get the App" again from there.',
    ],
  },
  other: {
    title: 'Install Carpooling',
    steps: [
      'Open your browser menu and look for "Install app" or "Add to Home Screen".',
      'If it is not available, try Chrome, Edge or Safari.',
    ],
  },
};

export function getInstructions(platform) {
  const entry = INSTRUCTIONS[platform] || INSTRUCTIONS.other;
  return { title: entry.title, steps: [...entry.steps] };
}
