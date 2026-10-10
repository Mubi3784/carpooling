/**
 * Roman Urdu & natural-language commute query parser.
 *
 * Turns queries such as "kal subah nust jana hai" or "parso pindi se islamabad"
 * into structured filters (date tab, time window, landmarks) that the ride feed
 * can apply locally. Runs entirely in the browser — no external NLP service.
 */
import { getDateStringWithOffset } from './dateUtils.js';

// Start inclusive, end exclusive (evening end 23:59 is inclusive)
export const TIME_WINDOWS = {
  morning: { label: 'Morning', start: '06:00', end: '12:00' },
  afternoon: { label: 'Afternoon', start: '12:00', end: '17:00' },
  evening: { label: 'Evening', start: '17:00', end: '23:59' },
};

// Islamabad sector pattern after normalisation (e.g. "f-10", "g-8", "i-8")
const ISLAMABAD_SECTOR = /[d-i]-\d{1,2}/;

/**
 * Landmarks: `detect` aliases are recognised in the query,
 * `match` aliases are checked against ride pickup/destination text.
 */
export const LANDMARKS = [
  {
    label: 'NUST H-12',
    detect: ['nust', 'h-12'],
    match: ['nust', 'h-12', 'national university of sciences'],
  },
  {
    label: 'FAST H-11',
    detect: ['fast', 'h-11', 'cfd'],
    match: ['fast', 'h-11', 'cfd', 'nuces'],
  },
  {
    label: 'COMSATS Park Road',
    detect: ['comsats', 'park road'],
    match: ['comsats', 'park road', 'chak shahzad'],
  },
  {
    label: 'Blue Area',
    detect: ['blue area', 'f-6', 'f-7', 'g-7', 'g-8'],
    match: ['blue area', 'f-6', 'f-7', 'g-7', 'g-8', 'jinnah avenue'],
  },
  {
    label: 'Rawalpindi',
    detect: ['saddar', 'pindi', 'rawalpindi', 'commercial market', 'rwp'],
    match: ['saddar', 'pindi', 'rawalpindi', 'commercial market', 'rwp'],
  },
  {
    label: 'Faizabad',
    detect: ['faizabad', 'i-8'],
    match: ['faizabad', 'i-8'],
  },
  {
    label: 'Bahria Town / DHA',
    detect: ['bahria', 'pwd', 'dha'],
    match: ['bahria', 'pwd', 'dha', 'defence'],
  },
  {
    label: 'Islamabad',
    detect: ['islamabad', 'isb'],
    match: ['islamabad', 'isb', 'blue area', 'nust', 'fast', 'comsats', 'cfd', ISLAMABAD_SECTOR],
  },
];

// Date intents, checked in this order so "day after tomorrow" wins over "tomorrow"
const DATE_RULES = [
  { tab: 'custom', offset: 2, aliases: ['day after tomorrow', 'parso', 'parson'] },
  { tab: 'tomorrow', offset: 1, aliases: ['tomorrow', 'kal'] },
  { tab: 'today', offset: 0, aliases: ['today', 'aaj'] },
];

// Time intents; am/pm may follow a number ("8am", "7 pm") but never sit inside a word
const TIME_RULES = [
  { key: 'morning', aliases: ['subah', 'subha', 'morning', /(?:\d{1,2}(?::\d{2})?\s?)?am/] },
  { key: 'afternoon', aliases: ['dopahar', 'dopehar', 'afternoon'] },
  {
    key: 'evening',
    aliases: ['sham', 'shaam', 'raat', 'evening', 'night', /(?:\d{1,2}(?::\d{2})?\s?)?pm/],
  },
];

const FILLER_WORDS = new Set([
  'se', 'sy', 'ko', 'jana', 'jaana', 'hai', 'hain', 'to', 'from', 'university', 'uni',
  'ki', 'ka', 'ke', 'mein', 'tak', 'for', 'ride', 'chahiye', 'the', 'a', 'go', 'going',
  'i', 'need', 'want', 'lift', 'wala', 'wali', 'campus',
]);

/**
 * Lowercases, collapses whitespace and unifies sector spellings:
 * "H12", "h 12" -> "h-12".
 */
const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b([d-i])[\s-]?(\d{1,2})\b/g, '$1-$2')
    .trim();
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches the alias only when bounded by non-alphanumerics (digits allowed before am/pm)
const aliasToRegExp = (alias, flags = '') => {
  const source = alias instanceof RegExp ? alias.source : escapeRegExp(alias);
  const leading = alias instanceof RegExp ? '(?<![a-z])' : '(?<![a-z0-9])';
  return new RegExp(`${leading}(?:${source})(?![a-z0-9])`, flags);
};

const aliasLength = (alias) => (alias instanceof RegExp ? alias.source.length : alias.length);

/**
 * Finds the first occurrence of any alias in `text`, blanks out every occurrence
 * (keeping string indices stable) and returns the updated text and match index.
 */
const consumeAliases = (text, aliases) => {
  let firstIndex = -1;
  let working = text;
  const sorted = [...aliases].sort((a, b) => aliasLength(b) - aliasLength(a));
  for (const alias of sorted) {
    working = working.replace(aliasToRegExp(alias, 'g'), (match, offset) => {
      if (firstIndex === -1 || offset < firstIndex) firstIndex = offset;
      return ' '.repeat(match.length);
    });
  }
  return { text: working, index: firstIndex };
};

/**
 * True when ride text (pickup or destination) belongs to the given landmark label.
 */
export const matchesLandmark = (text, label) => {
  const landmark = LANDMARKS.find((l) => l.label === label);
  if (!landmark) return false;
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return landmark.match.some((alias) => aliasToRegExp(alias).test(normalized));
};

/**
 * True when an "HH:mm" departure time falls inside the named time window.
 * Returns true when no window is requested.
 */
export const isDepartureInTimeWindow = (hhmm, timeOfDay) => {
  if (!timeOfDay) return true;
  const window = TIME_WINDOWS[timeOfDay];
  if (!window) return true;
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return false;
  if (window.end === '23:59') return hhmm >= window.start && hhmm <= window.end;
  return hhmm >= window.start && hhmm < window.end;
};

/**
 * Parses a commute query in English or Roman Urdu.
 * @param {string} rawQuery
 * @param {Date} now reference date (injectable for tests)
 * @returns {{ cleanKeyword: string, targetDateTab: 'today'|'tomorrow'|'custom'|null,
 *   customDate: string|null, timeOfDay: 'morning'|'afternoon'|'evening'|null,
 *   parsedLocations: string[], hasTokens: boolean }}
 */
export const parseCommuteQuery = (rawQuery, now = new Date()) => {
  const result = {
    cleanKeyword: '',
    targetDateTab: null,
    customDate: null,
    timeOfDay: null,
    parsedLocations: [],
    hasTokens: false,
  };

  let text = normalizeText(rawQuery);
  if (!text) return result;

  // 1. Date intent (first matching rule wins)
  for (const rule of DATE_RULES) {
    const consumed = consumeAliases(text, rule.aliases);
    if (consumed.index !== -1) {
      text = consumed.text;
      result.targetDateTab = rule.tab;
      if (rule.tab === 'custom') {
        result.customDate = getDateStringWithOffset(rule.offset, now);
      }
      break;
    }
  }

  // 2. Time-of-day intent (first matching rule wins)
  for (const rule of TIME_RULES) {
    const consumed = consumeAliases(text, rule.aliases);
    if (consumed.index !== -1) {
      text = consumed.text;
      result.timeOfDay = rule.key;
      break;
    }
  }

  // 3. Landmarks: longest aliases first across all landmarks, ordered by position in query
  const allAliases = LANDMARKS.flatMap((landmark) =>
    landmark.detect.map((alias) => ({ alias, label: landmark.label }))
  ).sort((a, b) => aliasLength(b.alias) - aliasLength(a.alias));

  const firstSeen = new Map();
  for (const { alias, label } of allAliases) {
    const consumed = consumeAliases(text, [alias]);
    if (consumed.index !== -1) {
      text = consumed.text;
      if (!firstSeen.has(label) || consumed.index < firstSeen.get(label)) {
        firstSeen.set(label, consumed.index);
      }
    }
  }
  result.parsedLocations = [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);

  // 4. Leftover keyword without filler words and stray punctuation
  result.cleanKeyword = text
    .split(/[\s,.;!?]+/)
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(' ');

  result.hasTokens = Boolean(
    result.targetDateTab || result.timeOfDay || result.parsedLocations.length > 0
  );

  return result;
};
