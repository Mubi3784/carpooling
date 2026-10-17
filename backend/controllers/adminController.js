/**
 * "Admin Panel" API (V1: API + DB only, no frontend view). Admin-only (adminOnly).
 * Chats are stored as plain text so admins can review reported conversations.
 * Even here no email/phone/whatsapp is returned: users appear as id + name.
 */
const mongoose = require('mongoose');
const { sendServerError } = require('../utils/errorResponse');
const ReportedFlag = require('../models/ReportedFlag');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const send = (res, status, message) => res.status(status).json({ success: false, message });

const pageParams = (req) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const { before } = req.query;
  let beforeId = null;
  if (before !== undefined && before !== '') {
    if (typeof before !== 'string' || !/^[0-9a-fA-F]{24}$/.test(before)) return null;
    beforeId = before;
  }
  return { limit, beforeId };
};

const namesFor = async (ids) => {
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
};
const userView = (id, names) => ({ id, name: names.get(String(id)) || null });

// @route GET /api/admin/reports?limit=&before=<reportId>
const listReports = async (req, res) => {
  try {
    const p = pageParams(req);
    if (!p) return send(res, 400, 'Invalid cursor');
    const filter = p.beforeId ? { _id: { $lt: p.beforeId } } : {};
    const reports = await ReportedFlag.find(filter).sort({ _id: -1 }).limit(p.limit).lean();
    const names = await namesFor(reports.flatMap((r) => [r.reporter, r.reportedUser]));
    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports.map((r) => ({
        id: r._id,
        reporter: userView(r.reporter, names),
        reportedUser: userView(r.reportedUser, names),
        conversationId: r.conversationId,
        messageId: r.messageId,
        messageText: r.messageText,
        senderId: r.senderId,
        messageCreatedAt: r.messageCreatedAt,
        rideContext: r.rideContext,
        reason: r.reason,
        note: r.note,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      })),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching reports');
  }
};

// @route GET /api/admin/conversations?limit=&before=<conversationId>
const listConversations = async (req, res) => {
  try {
    const p = pageParams(req);
    if (!p) return send(res, 400, 'Invalid cursor');
    const filter = p.beforeId ? { _id: { $lt: p.beforeId } } : {};
    const convs = await Conversation.find(filter).sort({ _id: -1 }).limit(p.limit).lean();
    const names = await namesFor(convs.flatMap((c) => [c.driver, c.passenger]));
    res.status(200).json({
      success: true,
      count: convs.length,
      data: convs.map((c) => ({
        id: c._id,
        rideId: c.ride,
        matchId: c.match,
        driver: userView(c.driver, names),
        passenger: userView(c.passenger, names),
        contextSummary: c.contextSummary,
        lastMessageAt: c.lastMessageAt,
        expiresAt: c.expiresAt,
      })),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching conversations');
  }
};

// @route GET /api/admin/conversations/:id/messages?limit=&before=<messageId>
const listConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return send(res, 404, 'Conversation not found');
    const p = pageParams(req);
    if (!p) return send(res, 400, 'Invalid cursor');
    const conv = await Conversation.findById(id).lean();
    if (!conv) return send(res, 404, 'Conversation not found');
    const filter = { conversation: conv._id };
    if (p.beforeId) filter._id = { $lt: p.beforeId };
    const msgs = await Message.find(filter).sort({ _id: -1 }).limit(p.limit).lean();
    res.status(200).json({
      success: true,
      count: msgs.length,
      data: msgs.reverse().map((m) => ({
        id: m._id,
        senderId: m.sender,
        senderRole: String(m.sender) === String(conv.driver) ? 'Driver' : 'Passenger',
        body: m.body,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching messages');
  }
};

module.exports = { listReports, listConversations, listConversationMessages };
