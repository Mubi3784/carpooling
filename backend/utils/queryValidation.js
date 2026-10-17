const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_FILTER_TEXT = 50;

// Optional query string: undefined/'' -> { ok: true, value: undefined }.
// Arrays/objects (e.g. ?x[$ne]=1, ?x=a&x=b) and over-long text -> { ok: false }.
const readOptionalString = (value, max = MAX_FILTER_TEXT) => {
  if (value === undefined || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false };
  const v = value.trim();
  if (v.length > max) return { ok: false };
  return { ok: true, value: v || undefined };
};

const readOptionalTime = (value) => {
  if (value === undefined || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return { ok: false };
  return { ok: true, value };
};

// Integer string within [min, max]
const readOptionalInt = (value, min, max) => {
  if (value === undefined || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) return { ok: false };
  const n = Number(value);
  if (n < min || n > max) return { ok: false };
  return { ok: true, value: n };
};

module.exports = { TIME_PATTERN, MAX_FILTER_TEXT, readOptionalString, readOptionalTime, readOptionalInt };
