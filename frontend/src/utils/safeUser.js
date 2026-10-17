// The only user fields kept in global state. Everything else (email, phone) stays out.
export const toSafeUser = (u) => {
  if (!u || typeof u !== 'object') return null;
  const id = u.id ?? u._id;
  if (!id) return null;
  return { id: String(id), name: String(u.name || ''), role: String(u.role || 'user') };
};
