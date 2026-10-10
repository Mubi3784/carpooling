/**
 * Formats a Date object to YYYY-MM-DD using local time (avoids UTC offset shifts).
 */
export const formatDateToYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayDateString = () => {
  return formatDateToYYYYMMDD(new Date());
};

export const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateToYYYYMMDD(tomorrow);
};

/**
 * Formats 24-hour time "08:30" into readable 12-hour "8:30 AM".
 */
export const formatTime12Hour = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

/**
 * Formats ISO date to: "25 September 2026, 09:30 AM"
 */
export const formatRoadStatusDate = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const day = date.getDate();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const formattedHours = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
};

/**
 * Returns the local YYYY-MM-DD string for `now` + `days`.
 */
export const getDateStringWithOffset = (days, now = new Date()) => {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return formatDateToYYYYMMDD(target);
};

/**
 * Relative freshness label for an ISO timestamp, e.g. "Updated 5 minutes ago".
 * Returns '' for missing/invalid input.
 */
export const getRelativeTimeLabel = (isoString, nowMs = Date.now()) => {
  if (!isoString) return '';
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return '';

  const diffMs = nowMs - time;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * True when the ISO timestamp is more than `hours` hours before `nowMs`.
 */
export const isOlderThanHours = (isoString, hours, nowMs = Date.now()) => {
  if (!isoString) return false;
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return false;
  return nowMs - time > hours * 60 * 60 * 1000;
};