import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info, Send } from 'lucide-react';
import { getConversation, getMessages, sendMessage, reportMessage } from '../services/api';
import { useChatUnread } from '../context/ChatUnreadContext';
import {
  MAX_MESSAGE_LENGTH, REPORT_REASONS, SAFETY_NOTE, validateDraft, newClientMessageId, counterText,
  pollDelay, classifyChatError, mergeMessages,
} from '../utils/chat';
import { formatTime12Hour } from '../utils/dateUtils';
import { formatDateChip } from '../utils/scheduling';
import VehicleBadge from '../components/VehicleBadge';
import MessageBubble from '../components/MessageBubble';
import { useAuth } from '../context/AuthContext';

const ENDED_TEXT = 'This chat has ended because the ride time has passed';

const ChatThread = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useChatUnread();
  const { user } = useAuth();

  const [convo, setConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [ended, setEnded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportTarget, setReportTarget] = useState(null);
  const [reason, setReason] = useState('harassment');
  const [reporting, setReporting] = useState(false);

  const lastServerId = useRef(null);
  const lastActivity = useRef(Date.now());
  const timer = useRef(null);
  const failures = useRef(0);
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const listRef = useRef(null);
  const nearBottom = useRef(true);

  const markEnded = useCallback(() => {
    stopped.current = true;
    clearTimeout(timer.current);
    setEnded(true);
  }, []);

  // Report dialog: focus first control, trap Tab, close on Escape, return focus on close.
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!reportTarget) return undefined;
    const opener = document.activeElement;
    const focusables = () => dialogRef.current
      ? Array.from(dialogRef.current.querySelectorAll('input, button:not([disabled])'))
      : [];
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { setReportTarget(null); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [reportTarget]);

  useEffect(() => {
    if (!ended) return undefined;
    const t = setTimeout(() => navigate('/chat', { replace: true }), 3000);
    return () => clearTimeout(t);
  }, [ended, navigate]);

  const poll = useCallback(async () => {
    if (stopped.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getMessages(id, lastServerId.current || undefined);
      const incoming = res.data.data || [];
      failures.current = 0;
      if (incoming.length > 0) {
        lastServerId.current = incoming[incoming.length - 1].id;
        if (incoming.some((m) => !m.mine)) lastActivity.current = Date.now();
        setMessages((prev) => mergeMessages(prev, incoming));
        refresh();
      }
    } catch (err) {
      if (classifyChatError(err) === 'ended') {
        markEnded();
      } else {
        failures.current += 1;
      }
    } finally {
      inFlight.current = false;
    }
  }, [id, markEnded, refresh]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    if (stopped.current) return;
    const base = pollDelay({ idleMs: Date.now() - lastActivity.current, visible: document.visibilityState === 'visible' });
    if (base === null) return; // hidden: paused until visibilitychange
    const delay = Math.min(base * 2 ** Math.min(failures.current, 3), 30000);
    timer.current = setTimeout(async () => {
      await poll();
      schedule();
    }, delay);
  }, [poll]);

  // Initial load + header
  useEffect(() => {
    stopped.current = false;
    lastServerId.current = null;
    lastActivity.current = Date.now();
    let alive = true;
    (async () => {
      try {
        const [c, m] = await Promise.all([getConversation(id), getMessages(id)]);
        if (!alive) return;
        setConvo(c.data.data);
        const list = m.data.data || [];
        if (list.length) lastServerId.current = list[list.length - 1].id;
        setMessages(list);
        refresh();
        schedule();
      } catch (err) {
        if (!alive) return;
        if (classifyChatError(err) === 'ended') markEnded();
        else setLoadError("Couldn't load this chat. Check your connection and try again.");
      }
    })();
    return () => {
      alive = false;
      stopped.current = true;
      clearTimeout(timer.current);
    };
  }, [id, markEnded, refresh, schedule]);

  // Pause when hidden, refresh immediately when visible/focused
  useEffect(() => {
    const onVisible = async () => {
      if (stopped.current) return;
      if (document.visibilityState === 'visible') {
        await poll();
        schedule();
      } else {
        clearTimeout(timer.current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [poll, schedule]);

  // Auto-scroll when near the bottom (own sends force it)
  useEffect(() => {
    const el = listRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const deliver = async (cid, body) => {
    try {
      const res = await sendMessage(id, { body, clientMessageId: cid });
      const saved = res.data.data;
      lastActivity.current = Date.now();
      setMessages((prev) => mergeMessages(prev.filter((m) => m.clientMessageId !== cid), [{ ...saved, mine: true }]));
      schedule();
    } catch (err) {
      const kind = classifyChatError(err);
      if (kind === 'ended') {
        markEnded();
        return;
      }
      setNotice(kind === 'rate' ? "You're sending messages too fast. Wait a moment and retry." : '');
      setMessages((prev) => prev.map((m) => (m.clientMessageId === cid ? { ...m, status: 'failed' } : m)));
    }
  };

  const onSend = (e) => {
    e.preventDefault();
    const v = validateDraft(draft);
    if (!v.ok) return;
    const cid = newClientMessageId();
    nearBottom.current = true;
    setNotice('');
    setMessages((prev) =>
      mergeMessages(prev, [{ clientMessageId: cid, mine: true, body: v.body, createdAt: new Date().toISOString(), status: 'sending' }])
    );
    setDraft('');
    deliver(cid, v.body);
  };

  const retry = (m) => {
    setNotice('');
    setMessages((prev) => prev.map((x) => (x.clientMessageId === m.clientMessageId ? { ...x, status: 'sending' } : x)));
    deliver(m.clientMessageId, m.body); // same clientMessageId: idempotent
  };

  const confirmReport = async () => {
    if (!reportTarget) return;
    setReporting(true);
    try {
      await reportMessage(reportTarget.id, { reason });
      setNotice('Thanks, report sent.');
    } catch (err) {
      setNotice(err.response?.data?.message || "Couldn't send the report. Please try again.");
    } finally {
      setReporting(false);
      setReportTarget(null);
    }
  };

  const otherName = String(convo?.otherParty?.name || '').split(' ')[0];
  const chip = convo?.ride?.rideDate ? formatDateChip(convo.ride.rideDate) : null;
  const valid = validateDraft(draft).ok;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col min-h-[calc(100dvh-8rem)]">
      <header className="mb-3">
        <Link to="/chat" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 min-h-[44px]">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to chats
        </Link>
        {convo && (
          <div className="bg-white border border-slate-200 rounded-2xl p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-base font-bold text-slate-900 min-w-0">
              <span className="truncate">{convo.ride?.pickupLocation}</span>
              <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{convo.ride?.destination}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
              {chip && <span>{chip.weekday}, {chip.label}</span>}
              {convo.ride?.departureTime && <span>{formatTime12Hour(convo.ride.departureTime)}</span>}
              <VehicleBadge vehicleType={convo.ride?.vehicleType} />
              <span>
                {String(convo.otherParty?.name || '').split(' ')[0]} ({convo.otherParty?.roleLabel})
              </span>
            </div>
          </div>
        )}
        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{SAFETY_NOTE}</span>
        </div>
      </header>

      {loadError && <div role="alert" className="mb-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{loadError}</div>}
      {ended && <div role="alert" className="mb-2 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl">{ENDED_TEXT}</div>}
      {notice && <div role="status" className="mb-2 p-3 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-xl">{notice}</div>}

      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="flex-1 overflow-y-auto space-y-2 pb-3 max-h-[55dvh] min-h-[120px]"
      >
        {messages.length === 0 && !loadError && !ended && (
          <p className="text-sm text-slate-500 text-center py-6">No messages yet. Say hello and agree on pickup details.</p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id || m.clientMessageId}
            message={m}
            currentUserId={user?.id}
            otherName={otherName}
            onRetry={retry}
            onReport={(msg) => { setReason('harassment'); setReportTarget(msg); }}
          />
        ))}
      </div>

      <form onSubmit={onSend} className="sticky bottom-14 md:bottom-0 bg-slate-50 pt-2 pb-2">
        <label htmlFor="chat-draft" className="sr-only">Message</label>
        <div className="flex items-end gap-2">
          <textarea
            id="chat-draft"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={ended}
            placeholder="Write a message"
            className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button type="submit" disabled={!valid || ended} className="min-h-[44px] min-w-[44px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1" aria-label="Send message">
            <Send className="w-4 h-4" aria-hidden="true" /> Send
          </button>
        </div>
        <p className={`text-xs mt-1 ${draft.length > MAX_MESSAGE_LENGTH ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
          {counterText(draft.length)}
        </p>
      </form>

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div ref={dialogRef} className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
            <h2 id="report-title" className="text-lg font-bold text-slate-900 mb-1">Report this message</h2>
            <p className="text-sm text-slate-500 mb-3">Why are you reporting it? Our team can review reported messages.</p>
            <fieldset className="space-y-2 mb-4">
              <legend className="sr-only">Reason</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 min-h-[44px] text-sm text-slate-800">
                  <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReportTarget(null)} disabled={reporting} className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm">Cancel</button>
              <button type="button" onClick={confirmReport} disabled={reporting} className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm disabled:opacity-50">
                {reporting ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatThread;
