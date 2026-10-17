import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Encodes the site origin locally (no network calls) as an SVG data URL.
const InstallQr = ({ className = 'w-40 h-40' }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src = useMemo(() => {
    if (!origin) return '';
    const qr = qrcode(0, 'M');
    qr.addData(origin);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [origin]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={`QR code to open Carpooling at ${origin}`}
      className={`${className} bg-white rounded-lg border border-slate-200`}
    />
  );
};

export default InstallQr;
