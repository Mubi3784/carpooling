/**
 * One-off migration: shift existing Ride departureDateTime and expiresAt by -5 hours.
 *
 * Why: before the P0 fix, times were parsed as UTC on the server, so a 08:30 PKT ride
 * was stored as 08:30Z instead of 03:30Z. This moves old rides to the correct instant.
 *
 * Usage (from backend\):
 *   node scripts/migrate-shift-times.js                                   # DRY RUN, counts only
 *   node scripts/migrate-shift-times.js --before=2026-05-20T10:00:00Z     # DRY RUN with the cutoff applied
 *   node scripts/migrate-shift-times.js --apply --before=2026-05-20T10:00:00Z
 *
 * --before is the UTC instant the P0 time zone fix went live (use the Vercel deployment
 * creation time converted to UTC). Only rides with NO `timeShiftedAt` AND `createdAt < before`
 * are shifted. New rides are stamped with `timeShiftedAt` at creation, and applied rides get
 * it too, so applying twice is safe. --apply is refused without --before.
 * Always run the dry run first and compare the counts.
 *
 * Needs MONGO_URI in backend\.env (or the environment). The connection string is never printed.
 */
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const SHIFT_MS = -5 * 60 * 60 * 1000;
const BEFORE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

const parseArgs = (argv, now = Date.now()) => {
  const apply = argv.includes('--apply');
  let before = null;

  const arg = argv.find((a) => a === '--before' || a.startsWith('--before='));
  if (arg !== undefined) {
    const value = arg.startsWith('--before=') ? arg.slice('--before='.length) : '';
    if (!BEFORE_PATTERN.test(value)) {
      throw new Error('--before must be an ISO UTC timestamp such as 2026-05-20T10:00:00Z');
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('--before is not a valid date');
    }
    // Reject calendar overflow such as 2026-02-31 (JS would roll it into March)
    if (date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
      throw new Error('--before is not a valid calendar date');
    }
    if (date.getTime() > now) {
      throw new Error('--before cannot be in the future');
    }
    before = date;
  }

  if (apply && !before) {
    throw new Error(
      'Refusing to --apply without --before=<ISO UTC deploy time of the P0 time zone fix>'
    );
  }
  return { apply, before };
};

const buildFilter = (before) => {
  const filter = { timeShiftedAt: { $exists: false } };
  if (before) filter.createdAt = { $lt: before };
  return filter;
};

const run = async () => {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const { apply, before } = args;

  dotenv.config();
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  // Use the raw collection so the strict schema cannot interfere
  const rides = mongoose.connection.collection('rides');

  const unstamped = { timeShiftedAt: { $exists: false } };
  const filter = buildFilter(before);
  const total = await rides.countDocuments({});
  const stamped = total - (await rides.countDocuments(unstamped));
  const pending = await rides.countDocuments(filter);

  console.log(`Rides total: ${total}`);
  console.log(`Already stamped (skipped): ${stamped}`);
  console.log(`Rides to shift: ${pending}`);
  if (before) {
    console.log(`Cutoff (createdAt < ${before.toISOString()})`);
    const afterCutoff = await rides.countDocuments({
      ...unstamped,
      createdAt: { $gte: before },
    });
    const noCreatedAt = await rides.countDocuments({
      ...unstamped,
      createdAt: { $exists: false },
    });
    console.log(`Unstamped but created at/after the cutoff (skipped): ${afterCutoff}`);
    console.log(`Unstamped with no createdAt (skipped, never shifted): ${noCreatedAt}`);
  } else {
    console.log(
      'WARNING: no --before given, so the count above includes every unstamped ride and --apply will be refused.'
    );
  }

  if (!apply) {
    console.log('DRY RUN: no changes made');
  } else {
    // Aggregation-pipeline update: shift both dates atomically per document
    const result = await rides.updateMany(filter, [
      {
        $set: {
          departureDateTime: { $add: ['$departureDateTime', SHIFT_MS] },
          expiresAt: { $add: ['$expiresAt', SHIFT_MS] },
          timeShiftedAt: '$$NOW',
        },
      },
    ]);
    console.log(`APPLIED: modified ${result.modifiedCount} rides.`);
  }

  await mongoose.disconnect();
};

module.exports = { parseArgs, buildFilter, SHIFT_MS };

if (require.main === module) {
  run().catch(async (err) => {
    console.error(
      `Migration failed (${err.name}). Details withheld to avoid printing host names or the connection string.`
    );
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  });
}
