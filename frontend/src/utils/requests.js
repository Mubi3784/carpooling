// Pure helpers for passenger requests (testable with node --test)

const STATUS_LABELS = {
  ACTIVE: 'Active',
  MATCHED: 'Matched',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
};

export const statusLabel = (status) => STATUS_LABELS[status] || 'Unknown';

const byDateTime = (a, b) =>
  `${a.requestDate} ${a.departureTime}`.localeCompare(`${b.requestDate} ${b.departureTime}`);

/**
 * Groups requests sharing a seriesId (2+) into one group; others are single groups.
 */
export const groupRequestsBySeries = (requests) => {
  const bySeries = new Map();
  requests.forEach((r) => {
    if (!r.seriesId) return;
    if (!bySeries.has(r.seriesId)) bySeries.set(r.seriesId, []);
    bySeries.get(r.seriesId).push(r);
  });

  const groups = [];
  requests.forEach((r) => {
    const members = r.seriesId ? bySeries.get(r.seriesId) : null;
    if (members && members.length >= 2) {
      if (!groups.some((g) => g.seriesId === r.seriesId)) {
        groups.push({
          key: `series-${r.seriesId}`,
          seriesId: r.seriesId,
          requests: [...members].sort(byDateTime),
        });
      }
    } else {
      groups.push({ key: `request-${r.id}`, seriesId: null, requests: [r] });
    }
  });
  return groups.sort((a, b) => byDateTime(a.requests[0], b.requests[0]));
};

export const formatBadgeCount = (n) => (n > 99 ? '99+' : String(n));
