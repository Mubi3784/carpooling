import React from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import InstallButton from './InstallButton';
import InstallQr from './InstallQr';

const InstallSection = () => {
  const { isInstalled } = useInstallPrompt();
  if (isInstalled) return null;

  return (
    <section
      aria-labelledby="install-section-heading"
      className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4"
    >
      <div className="hidden md:block shrink-0">
        <InstallQr className="w-32 h-32" />
      </div>
      <div className="flex-1">
        <h2 id="install-section-heading" className="text-lg font-bold text-slate-900 mb-1">
          Get the App
        </h2>
        <p className="hidden md:block text-sm text-slate-600 mb-3">
          Scan with your phone camera to open Carpooling, then choose Add to Home Screen / Install.
        </p>
        <ul className="md:hidden text-sm text-slate-600 mb-3 list-disc pl-5 space-y-0.5">
          <li>Opens faster from your home screen</li>
          <li>Full-screen, app-like experience</li>
          <li>One tap from your home screen, no app store needed</li>
        </ul>
        <InstallButton variant="section" />
      </div>
    </section>
  );
};

export default InstallSection;
