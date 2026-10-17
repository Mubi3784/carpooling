export const MAX_MESSAGE_LENGTH = 500;
export const POLL_ACTIVE_MS = 4000;
export const POLL_IDLE_MS = 12000;
export const IDLE_AFTER_MS = 120000;

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam' },
  { value: 'unsafe', label: 'Unsafe or threatening' },
  { value: 'other', label: 'Something else' },
];

export const SAFETY_NOTE =
  'A conversation or an accepted request is not a verified guarantee. Do not share personal contact details. Report abusive messages.';

export const validateDraft = (text) => {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return { ok: false, reason: 'empty' };
  if (t.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, body: t };
};

export const newClientMessageId = () => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  let s = '';
  for (let i = 0; i < 24; i += 1) s += Math.floor(Math.random() * 36).toString(36);
  return `m-${s}`;
};

export const counterText = (len) => `${len}/${MAX_MESSAGE_LENGTH}`;

// null = do not poll (tab hidden)
export const pollDelay = ({ idleMs = 0, visible = true } = {}) => {
  if (!visible) return null;
  return idleMs >= IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
};

export const classifyChatError = (err) => {
  const status = err?.response?.status;
  if (status === 404 || status === 410) return 'ended';
  if (status === 429) return 'rate';
  if (!err?.response) return 'offline';
  return 'other';
};

// Own-message check. The API sends a server-computed boolean `mine` (no sender ids on the wire);
// fall back to a String() comparison of any sender id field so ObjectId/number/string mismatches work.
export const isOwnMessage = (message, currentUserId) => {
  if (!message) return false;
  if (typeof message.mine === 'boolean') return message.mine;
  if (currentUserId === undefined || currentUserId === null || currentUserId === '') return false;
  const candidates = [message.senderId, message.sender_id, message.sender?.id, message.sender?._id, message.sender];
  const sid = candidates.find((v) => v !== undefined && v !== null && v !== '');
  if (sid === undefined) return false;
  return String(sid) === String(currentUserId);
};

// Presentation model for one chat bubble (pure so alignment is unit-testable)
export const bubbleView = (message, { currentUserId, otherName } = {}) => {
  const own = isOwnMessage(message, currentUserId);
  const common = 'min-w-0 max-w-[80%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]';
  const meta = 'mt-1 flex flex-wrap items-center gap-2 text-[11px]';
  let status = null;
  if (own) status = message?.status === 'sending' ? 'sending' : message?.status === 'failed' ? 'failed' : 'sent';
  return {
    own,
    side: own ? 'right' : 'left',
    rowClass: own ? 'flex w-full justify-end' : 'flex w-full justify-start',
    bubbleClass: own
      ? `${common} ml-auto rounded-br-md bg-emerald-700 text-white`
      : `${common} mr-auto rounded-bl-md border border-slate-200 bg-slate-100 text-slate-900`,
    metaClass: own ? `${meta} justify-end text-emerald-50` : `${meta} text-slate-600`,
    srLabel: own ? 'You said' : `${otherName || 'They'} said`,
    status,
    canReport: !own && Boolean(message?.id),
  };
};

// Merge by id, then by clientMessageId (optimistic -> server replacement). Sorted by createdAt.
export const mergeMessages = (existing = [], incoming = []) => {
  const out = [...existing];
  for (const m of incoming) {
    const i = out.findIndex(
      (e) => (m.id && e.id === m.id) || (m.clientMessageId && e.clientMessageId === m.clientMessageId)
    );
    if (i >= 0) out[i] = { ...out[i], ...m };
    else out.push(m);
  }
  return out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};
