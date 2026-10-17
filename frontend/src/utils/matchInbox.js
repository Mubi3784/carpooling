const roleForMode = (mode) => (mode === 'driver' ? 'DRIVER' : 'PASSENGER');

export const filterMatchesByMode = (matches = [], mode) =>
  matches.filter((m) => m.role === roleForMode(mode));

// Pending incoming items that live in the other mode.
export const otherModeCount = (matches = [], mode) => {
  const other = mode === 'driver' ? 'passenger' : 'driver';
  return filterMatchesByMode(matches, other).filter(
    (m) => m.status === 'PENDING' && m.direction === 'incoming'
  ).length;
};

// Incoming PENDING items awaiting my response, regardless of mode.
export const pendingIncoming = (matches = []) =>
  matches.filter((m) => m.status === 'PENDING' && m.direction === 'incoming');

// `needsResponse` is always shown (any mode); `rest` is the mode-filtered remainder without duplicates.
export const splitInbox = (matches = [], mode) => {
  const needsResponse = pendingIncoming(matches);
  const ids = new Set(needsResponse.map((m) => m.id));
  const rest = filterMatchesByMode(matches, mode).filter((m) => !ids.has(m.id));
  return { needsResponse, rest };
};

// Where to go after accepting: the conversation id from the response, else lookup by match id.
export const chatTargetAfterAccept = (response, conversations = [], matchId) => {
  const id = response?.data?.conversationId || response?.conversationId;
  if (id) return `/chat/${id}`;
  const convo = conversationForMatch(conversations, matchId);
  return convo ? `/chat/${convo.id}` : null;
};

export const conversationForMatch = (conversations = [], matchId) =>
  conversations.find((c) => String(c.matchId) === String(matchId)) || null;
