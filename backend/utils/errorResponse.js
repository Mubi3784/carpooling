/**
 * Sends a safe error response from a controller catch block.
 * Mongoose validation/cast errors are client mistakes (400 with a useful message).
 * Anything else is logged server-side only; clients get the generic fallback in production.
 */
const sendServerError = (res, error, fallbackMessage) => {
  if (error && (error.name === 'ValidationError' || error.name === 'CastError')) {
    const message =
      error.name === 'ValidationError'
        ? Object.values(error.errors).map((e) => e.message).join(', ')
        : 'Invalid identifier provided';
    return res.status(400).json({ success: false, message });
  }
  console.error(`${fallbackMessage}:`, error && error.message);
  return res.status(500).json({ success: false, message: fallbackMessage });
};

module.exports = { sendServerError };
