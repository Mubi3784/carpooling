import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getInstructions } from '../lib/installPlatform';
import InstallQr from './InstallQr';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

const InstallDialog = ({ open, onClose, platform, note }) => {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDesktop = platform.startsWith('desktop-');
  const { title, steps } = getInstructions(platform);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full md:max-w-md max-h-[90dvh] overflow-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex items-center justify-center min-h-11 min-w-11 text-slate-500 hover:text-slate-800 rounded-lg"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <h2 id="install-dialog-title" className="text-lg font-bold text-slate-900 pr-10 mb-1">
          Get the App
        </h2>
        <p className="text-slate-600 mb-4">
          Carpooling installs from your browser. It is not in an app store.
        </p>

        {note && <p className="mb-3 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{note}</p>}

        {isDesktop && (
          <div className="flex flex-col items-center text-center gap-2 mb-4">
            <InstallQr />
            <p className="text-slate-700">
              Scan with your phone camera to open Carpooling, then choose Add to Home Screen /
              Install.
            </p>
          </div>
        )}

        {(!isDesktop || platform !== 'desktop-firefox') && (
          <>
            <h3 className="font-semibold text-slate-900 mb-1">
              {isDesktop ? `On this computer: ${title}` : title}
            </h3>
            <ol className="list-decimal pl-5 space-y-1 text-slate-700">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </>
        )}
        {platform === 'desktop-firefox' && (
          <p className="text-slate-600">
            Firefox on desktop cannot install web apps, so use your phone with the QR code above.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

export default InstallDialog;
