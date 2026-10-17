/**
 * Chat V1 (plain text, polling).
 *
 * XSS stance: messages are stored and returned as PLAIN TEXT. The server never renders
 * HTML; it strips NUL/control characters and leaves everything else untouched (so "<b>"
 * is kept as the literal characters, not interpreted). Clients MUST render bodies as text
 * (React escaping / textContent), never as HTML.
 *
 * Privacy: responses are built field by field. The counterpart is a first name plus a
 * role label only. No ids of users, no email/phone/whatsapp anywhere.
 */
const { sendServerError } = require('../utils/errorResponse');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const RideMatch = require('../models/RideMatch');
const User = require('../models/User');
const ReportedFlag = require('../models/ReportedFlag');
const { loadConversationForUser, isObjectId } = require('../utils/chatAccess');
const push = require('../utils/push');

const MAX_BODY = 500;
const MAX_RAW_BODY = 2000;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_MESSAGES_PER_CONVERSATION = 300;
const SEND_LIMIT_PER_MINUTE = 20;
const REPORTS_PER_HOUR = 10;
const REPORT_REASONS = ['harassment', 'spam', 'unsafe', 'other'];
const PAGE_LIMIT = 100;

const send = (res, status, message) => res.status(status).json({ success: false, message });
const fail = (res, error) => send(res, error.status, error.message);

// NUL + control characters out (newline kept), tabs become spaces, 3+ blank lines collapse
const sanitizeBody = (raw) =>
  raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const firstName = (user) => {
  const n = user && typeof user.name === 'string' ? user.name.trim().split(/\s+/)[0] : '';
  return n || null;
};

const roleLabel = (role) => (role === 'DRIVER' ? 'Driver' : 'Passenger');

const conversationView = (c, role, otherUser) => {
  const otherRole = role === 'DRIVER' ? 'PASSENGER' : 'DRIVER';
  return {
    id: c._id,
    matchId: c.match,
    rideId: c.ride,
    role,
    otherParty: {
      name: firstName(otherUser) || roleLabel(otherRole),
      roleLabel: roleLabel(otherRole),
    },
    ride: {
      pickupLocation: c.contextSummary?.pickupLocation,
      destination: c.contextSummary?.destination,
      rideDate: c.contextSummary?.rideDate,
      departureTime: c.contextSummary?.departureTime,
      vehicleType: c.contextSummary?.vehicleType,
    },
    unread: role === 'DRIVER' ? c.unread?.driver || 0 : c.unread?.passenger || 0,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview || '',
    expiresAt: c.expiresAt,
  };
};

const messageView = (m, viewerId) => ({
  id: m._id,
  mine: String(m.sender) === String(viewerId),
  body: m.body,
  createdAt: m.createdAt,
  readAt: m.readAt,
});

const otherUserId = (c, role) => (role === 'DRIVER' ? c.passenger : c.driver);

// @route GET /api/chat/conversations
const listConversations = async (req, res) => {
  try {
    const me = req.user._id;
    const convs = await Conversation.find({
      $or: [{ driver: me }, { passenger: me }],
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(50)
      .lean();
    const roleOf = (c) => (String(c.driver) === String(me) ? 'DRIVER' : 'PASSENGER');
    const ids = [...new Set(convs.map((c) => String(otherUserId(c, roleOf(c)))))];
    const users = await User.find({ _id: { $in: ids } }).select('name').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const data = convs.map((c) => {
      const role = roleOf(c);
      return conversationView(c, role, byId.get(String(otherUserId(c, role))));
    });
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching chats');
  }
};

// @route GET /api/chat/conversations/:id
const getConversation = async (req, res) => {
  try {
    const r = await loadConversationForUser(req.params.id, req.user._id);
    if (r.error) return fail(res, r.error);
    const other = await User.findById(otherUserId(r.conversation, r.role)).select('name').lean();
    res.status(200).json({ success: true, data: conversationView(r.conversation, r.role, other) });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching chat');
  }
};

// @route GET /api/chat/conversations/:id/messages?after=<messageId|ISO date>
const getMessages = async (req, res) => {
  try {
    const r = await loadConversationForUser(req.params.id, req.user._id);
    if (r.error) return fail(res, r.error);
    const { conversation, role } = r;
    const me = req.user._id;
    const { after } = req.query;

    const filter = { conversation: conversation._id };
    let sort = { createdAt: 1, _id: 1 };
    let newestFirst = false;
    if (after !== undefined && after !== '') {
      if (typeof after !== 'string') return send(res, 400, 'Invalid cursor');
      if (isObjectId(after) && /^[0-9a-fA-F]{24}$/.test(after)) {
        filter._id = { $gt: after };
        sort = { _id: 1 };
      } else {
        const d = new Date(after);
        if (Number.isNaN(d.getTime())) return send(res, 400, 'Invalid cursor');
        filter.createdAt = { $gt: d };
      }
    } else {
      // First load: the most recent page
      sort = { createdAt: -1, _id: -1 };
      newestFirst = true;
    }

    // Single indexed query ({conversation, createdAt}) for the page
    let msgs = await Message.find(filter).sort(sort).limit(PAGE_LIMIT).lean();
    if (newestFirst) msgs.reverse();

    const unread = role === 'DRIVER' ? conversation.unread?.driver : conversation.unread?.passenger;
    const incoming = msgs.filter((m) => String(m.sender) !== String(me) && !m.readAt);
    if (incoming.length > 0 || unread > 0) {
      const now = new Date();
      await Message.updateMany(
        { conversation: conversation._id, sender: { $ne: me }, readAt: null },
        { $set: { readAt: now } }
      );
      await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { [role === 'DRIVER' ? 'unread.driver' : 'unread.passenger']: 0 } }
      );
      msgs = msgs.map((m) =>
        String(m.sender) !== String(me) && !m.readAt ? { ...m, readAt: now } : m
      );
    }

    res.status(200).json({
      success: true,
      count: msgs.length,
      data: msgs.map((m) => messageView(m, me)),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching messages');
  }
};

// @route POST /api/chat/conversations/:id/messages  { body, clientMessageId }
const sendMessage = async (req, res) => {
  try {
    const r = await loadConversationForUser(req.params.id, req.user._id);
    if (r.error) return fail(res, r.error);
    const { conversation, role } = r;
    const me = req.user._id;

    const { body, clientMessageId } = req.body || {};
    if (typeof clientMessageId !== 'string' || !CLIENT_ID_PATTERN.test(clientMessageId)) {
      return send(res, 400, 'Invalid message id');
    }
    if (typeof body !== 'string') return send(res, 400, 'Message must be text');
    if (body.length > MAX_RAW_BODY) return send(res, 400, `Message is too long (max ${MAX_BODY} characters)`);
    const text = sanitizeBody(body);
    if (text.length === 0) return send(res, 400, 'Message cannot be empty');
    if (text.length > MAX_BODY) return send(res, 400, `Message is too long (max ${MAX_BODY} characters)`);

    // Idempotent retry: same clientMessageId returns the stored message
    const existing = await Message.findOne({
      conversation: conversation._id,
      clientMessageId,
      sender: me,
    }).lean();
    if (existing) {
      return res.status(200).json({ success: true, replayed: true, data: messageView(existing, me) });
    }

    const total = await Message.countDocuments({ conversation: conversation._id });
    if (total >= MAX_MESSAGES_PER_CONVERSATION) {
      return send(res, 429, 'This chat has reached its message limit. Please arrange the rest in person.');
    }
    // Mongo-backed so it holds across serverless instances
    const recent = await Message.countDocuments({
      sender: me,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });
    if (recent >= SEND_LIMIT_PER_MINUTE) {
      res.set('Retry-After', '30');
      return send(res, 429, "You're sending messages too quickly. Please wait a moment.");
    }

    let message;
    try {
      message = await Message.create({
        conversation: conversation._id,
        sender: me,
        body: text,
        clientMessageId,
        expiresAt: conversation.expiresAt,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const dup = await Message.findOne({ conversation: conversation._id, clientMessageId }).lean();
        if (dup && String(dup.sender) === String(me)) {
          return res.status(200).json({ success: true, replayed: true, data: messageView(dup, me) });
        }
        return send(res, 409, 'Message id already used');
      }
      throw err;
    }

    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: { lastMessageAt: message.createdAt, lastMessagePreview: text.slice(0, 80) },
        $inc: { [role === 'DRIVER' ? 'unread.passenger' : 'unread.driver']: 1 },
      }
    );
    // Generic push to the other participant; awaited (bounded, never throws) for serverless
    await push.notifyMessage(conversation._id, otherUserId(conversation, role));
    res.status(201).json({ success: true, data: messageView(message, me) });
  } catch (error) {
    sendServerError(res, error, 'Server error sending message');
  }
};

// @route GET /api/chat/unread-count  -> total unread messages + pending matches awaiting me
const getUnreadCount = async (req, res) => {
  try {
    const me = req.user._id;
    const now = new Date();
    const [asDriver, asPassenger, pendingMatches] = await Promise.all([
      Conversation.find({ driver: me, expiresAt: { $gt: now } }).select('unread.driver').lean(),
      Conversation.find({ passenger: me, expiresAt: { $gt: now } }).select('unread.passenger').lean(),
      RideMatch.countDocuments({
        status: 'PENDING',
        expiresAt: { $gt: now },
        $or: [
          { driver: me, initiatedBy: 'PASSENGER' },
          { passenger: me, initiatedBy: 'DRIVER' },
        ],
      }),
    ]);
    const unreadMessages =
      asDriver.reduce((s, c) => s + (c.unread?.driver || 0), 0) +
      asPassenger.reduce((s, c) => s + (c.unread?.passenger || 0), 0);
    res.status(200).json({
      success: true,
      data: { count: unreadMessages + pendingMatches, unreadMessages, pendingMatches },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching unread count');
  }
};

// @route POST /api/chat/messages/:id/report  { reason, note? }
const reportMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const notFound = () => send(res, 404, 'Message not found');
    if (!isObjectId(id)) return notFound();
    const message = await Message.findById(id).lean();
    if (!message) return notFound();
    const r = await loadConversationForUser(String(message.conversation), req.user._id);
    if (r.error) {
      // Non-participants and missing chats look identical to "no such message"
      return r.error.status === 410 ? fail(res, r.error) : notFound();
    }
    const { conversation } = r;
    const me = req.user._id;
    if (String(message.sender) === String(me)) {
      return send(res, 400, 'You cannot report your own message');
    }

    const { reason, note } = req.body || {};
    if (typeof reason !== 'string' || !REPORT_REASONS.includes(reason)) {
      return send(res, 400, 'Please choose a valid reason');
    }
    if (note !== undefined && (typeof note !== 'string' || note.trim().length > 200)) {
      return send(res, 400, 'Note must be 200 characters or fewer');
    }

    const already = await ReportedFlag.exists({ reporter: me, messageId: String(message._id) });
    if (already) {
      return res.status(200).json({ success: true, replayed: true, message: 'Already reported' });
    }
    const recent = await ReportedFlag.countDocuments({
      reporter: me,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (recent >= REPORTS_PER_HOUR) {
      return send(res, 429, 'Too many reports. Please try again later.');
    }

    const cs = conversation.contextSummary || {};
    try {
      await ReportedFlag.create({
        reporter: me,
        reportedUser: message.sender,
        conversationId: String(conversation._id),
        messageId: String(message._id),
        messageText: message.body.slice(0, 500),
        senderId: String(message.sender),
        messageCreatedAt: message.createdAt,
        rideContext: {
          rideId: String(conversation.ride),
          pickupLocation: cs.pickupLocation,
          destination: cs.destination,
          rideDate: cs.rideDate,
          departureTime: cs.departureTime,
          vehicleType: cs.vehicleType,
        },
        reason,
        note: note ? note.trim() : '',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(200).json({ success: true, replayed: true, message: 'Already reported' });
      }
      throw err;
    }
    res.status(201).json({ success: true, message: 'Thanks. Our team will review this report.' });
  } catch (error) {
    sendServerError(res, error, 'Server error reporting message');
  }
};

module.exports = {
  listConversations,
  getConversation,
  getMessages,
  sendMessage,
  getUnreadCount,
  reportMessage,
  sanitizeBody,
};
