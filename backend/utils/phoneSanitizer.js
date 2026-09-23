/**
 * Sanitizes phone numbers into international format without leading zeros, pluses, or dashes.
 * Example: '0310-5517386' -> '923105517386'
 * Example: '+92 310 5517386' -> '923105517386'
 */
const sanitizePhoneNumber = (phone) => {
  if (!phone) return '';

  // Strip all non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // If starts with 0 (e.g. 03105517386), replace leading 0 with 92
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.substring(1);
  }

  return cleaned;
};

/**
 * Validates if the phone number represents a standard mobile number format.
 */
const isValidPhoneNumber = (phone) => {
  const cleaned = sanitizePhoneNumber(phone);
  // International standard: between 10 and 15 digits (Pakistan standard is 12 digits: 923xxxxxxxxx)
  return cleaned.length >= 10 && cleaned.length <= 15;
};

module.exports = {
  sanitizePhoneNumber,
  isValidPhoneNumber,
};