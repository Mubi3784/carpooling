import { formatTime12Hour } from './dateUtils.js';
import { normalizeVehicleType, getVehicleLabel } from './vehicle.js';

// Pure helpers for WhatsApp sharing. Only whitelisted listing fields are ever read:
// never phone, email, notes, tokens, or driver/passenger objects.

const MAX_FIELD = 100;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const clean = (value) =>
  String(value ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FIELD);

const defaultEnv = () => {
  try {
    return import.meta.env?.VITE_APP_BASE_URL;
  } catch {
    return undefined;
  }
};

const defaultOrigin = () => (typeof window !== 'undefined' ? window.location?.origin : '') || '';

// Production domain from VITE_APP_BASE_URL (build time), else the current origin.
export const getAppBaseUrl = (env = defaultEnv(), origin = defaultOrigin()) => {
  const raw = typeof env === 'string' ? env.trim() : '';
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
      }
    } catch {
      // fall through to the origin
    }
  }
  return String(origin || '').replace(/\/+$/, '');
};

export const buildRideLink = (id, base = getAppBaseUrl()) => `${base}/rides/${encodeURIComponent(id)}`;
export const buildRequestLink = (id, base = getAppBaseUrl()) => `${base}/requests/${encodeURIComponent(id)}`;

export const buildRideShareText = (ride, link) =>
  [
    '🚗 Carpooling Ride Available!',
    `📍 From: ${clean(ride?.pickupLocation)}`,
    `📍 To: ${clean(ride?.destination)}`,
    `📅 Date: ${clean(ride?.rideDate)}`,
    `🕒 Departure: ${clean(formatTime12Hour(ride?.departureTime))}`,
    `🚘 Vehicle: ${getVehicleLabel(ride?.vehicleType)}`,
    `💺 Seats: ${clean(ride?.availableSeats)}`,
    'View details & request to join on Carpooling:',
    link,
  ].join('\n\n');

export const buildRequestShareText = (request, link) => {
  const isBike = normalizeVehicleType(request?.vehiclePreference) === 'BIKE';
  return [
    '🙋 Ride Request on Carpooling!',
    `📍 Pickup: ${clean(request?.pickupLocation)}`,
    `📍 Destination: ${clean(request?.destination)}`,
    `📅 Date: ${clean(request?.requestDate)}`,
    `🕒 Preferred Time: ${clean(formatTime12Hour(request?.departureTime))}`,
    `${isBike ? '🏍️' : '🚘'} Vehicle Preference: ${isBike ? 'Bike' : 'Car'}`,
    'View the request on Carpooling:',
    link,
  ].join('\n\n');
};

export const buildWhatsAppUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// Must be called from a user click. Falls back to same-tab navigation if the popup is blocked.
export const openWhatsAppShare = (text) => {
  const url = buildWhatsAppUrl(text);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
};
