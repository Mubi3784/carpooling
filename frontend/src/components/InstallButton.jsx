import React from 'react';
import { Download } from 'lucide-react';
import { useInstallAction } from '../hooks/useInstallPrompt';
import InstallDialog from './InstallDialog';

const STYLES = {
  navbar:
    'min-h-11 min-w-11 px-2.5 sm:px-4 text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  section:
    'min-h-11 px-5 text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-md',
};

const InstallButton = ({ variant = 'navbar' }) => {
  const action = useInstallAction();
  if (action.isInstalled) return null;

  return (
    <>
      <button
        type="button"
        onClick={action.onClick}
        aria-label="Get the App"
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${STYLES[variant]}`}
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span className={variant === 'navbar' ? 'hidden sm:inline' : ''}>Get the App</span>
      </button>
      {action.note && variant === 'section' && (
        <p role="status" className="text-sm text-emerald-700 mt-2">
          {action.note}
        </p>
      )}
      <InstallDialog
        open={action.dialogOpen}
        onClose={action.closeDialog}
        platform={action.platform}
        note={action.note}
      />
    </>
  );
};

export default InstallButton;
