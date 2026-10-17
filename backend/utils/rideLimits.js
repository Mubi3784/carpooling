// Scheduling limits shared by driver rides (and later passenger requests).
const MAX_ACTIVE_FUTURE_RIDES_PER_USER = 7;
// P3: the same single cap applies to a user's rides AND passenger requests combined
// (one shared budget; see utils/activeItemCount.js).
const MAX_ACTIVE_FUTURE_ITEMS_PER_USER = MAX_ACTIVE_FUTURE_RIDES_PER_USER;
const MAX_DATES_PER_SUBMISSION = 6;
const SCHEDULE_WINDOW_DAYS = 13; // today .. today+13

module.exports = {
  MAX_ACTIVE_FUTURE_RIDES_PER_USER,
  MAX_ACTIVE_FUTURE_ITEMS_PER_USER,
  MAX_DATES_PER_SUBMISSION,
  SCHEDULE_WINDOW_DAYS,
};
