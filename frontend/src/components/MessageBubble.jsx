import React from 'react';
import { Flag } from 'lucide-react';
import { bubbleView } from '../utils/chat';

const MessageBubble = ({ message, currentUserId, otherName, onRetry, onReport }) => {
  const view = bubbleView(message, { currentUserId, otherName });
  return (
    <div className={view.rowClass} data-side={view.side}>
      <div className={view.bubbleClass}>
        {/* Plain text only: React escapes the string; never inject HTML */}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="sr-only">{view.srLabel}: </span>
          {message.body}
        </p>
        <div className={view.metaClass}>
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          {view.status === 'sending' && <span>Sending...</span>}
          {view.status === 'failed' && (
            <>
              <span className="font-semibold">Failed to send</span>
              <button type="button" onClick={() => onRetry(message)} className="underline font-semibold">Retry</button>
            </>
          )}
          {view.status === 'sent' && <span>Sent</span>}
          {view.canReport && (
            <button type="button" onClick={() => onReport(message)} className="inline-flex items-center gap-1 underline font-semibold" aria-label="Report this message">
              <Flag className="w-3 h-3" aria-hidden="true" /> Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
