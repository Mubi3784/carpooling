# MongoDB `querySrv ECONNREFUSED` – Debug Report

## 1. Root cause
Your code and your Atlas setup were both fine. The problem was the DNS server that Node.js picked on this Windows machine.

- Node v24.16.0 reports its DNS server as `127.0.0.1` (`dns.getServers()` → `['127.0.0.1']`). Nothing answers DNS on localhost, so the `mongodb+srv` SRV lookup gets `ECONNREFUSED`.
- Windows itself resolves the same record through the router at `192.168.18.1`. `nslookup -type=SRV _mongodb._tcp.cluster0.pac9jjd.mongodb.net` returns 3 shards: `ac-utwutcs-shard-00-00/01/02.pac9jjd.mongodb.net:27017`.
- Node with explicit servers `8.8.8.8, 1.1.1.1` resolves the same 3 shards.
- Config check: `.env` keys are `MONGO_URI, JWT_SECRET, PORT, CLIENT_URL, ADMIN_EMAIL`. `MONGO_URI` is present, uses `mongodb+srv://`, and its host is `cluster0.pac9jjd.mongodb.net`. The code reads `process.env.MONGO_URI` (names match). `dotenv.config()` runs before any `connectDB()` call, because connectDB only runs inside request middleware.
- Git: there are no backend changes in the working tree (all uncommitted changes are in the frontend/PWA). So your recent code changes did not cause this.

## 2. Files inspected
`backend/package.json` (mongoose ^8.4.0, dotenv ^16.6.1), `backend/server.js`, `backend/config/db.js`, `backend/.env` (key names only), `backend/.gitignore`, `backend/tests/*.js`, `git status`.

## 3. Files modified
- `backend/config/db.js`: added an opt-in `DNS_SERVERS` override. If that variable is set, `dns.setServers()` runs just before `mongoose.connect`. It runs inside `connectDB` because `db.js` is loaded before dotenv.
- `backend/.env` (local only, gitignored by `backend/.gitignore`): appended `DNS_SERVERS=8.8.8.8,1.1.1.1`. Existing values were not touched.

## 4. Fix in plain language
Before connecting, Node has to look up where your Atlas cluster lives. On this PC, Node asked a DNS "phone book" at 127.0.0.1 that doesn't exist. The new setting tells Node to use Google/Cloudflare DNS instead, but only when `DNS_SERVERS` is set. Vercel doesn't have that variable, so production behaves exactly as before.

## 5. Verification
| Check | Result |
|---|---|
| Env vars loaded (names/scheme/host only) | Passed |
| SRV resolution: OS / Node default / Node with 8.8.8.8 | OK / ECONNREFUSED / OK |
| Backend start + `✅ MongoDB Connected: ac-utwutcs-shard-00-01.pac9jjd.mongodb.net` | Passed (on port 5055, see below) |
| GET /api/health, /api/rides, /api/road-status (read-only) | 200, 200, 200 |
| `npm test` (in-memory MongoDB, guarded against remote URIs) | 24/24 passed |
| Test server stopped, port 5055 freed | Passed |
| Frontend ↔ local backend, login/ride flows in a browser | Not run manually (API tests cover auth/rides) |

Port 5000 was already in use by another process on your machine (probably your own `npm run dev`). I didn't stop it, so verification ran with `PORT=5055`.

## 6. Manual steps
1. Restart your backend dev server (`npm run dev`) so it picks up the new `.env` value. You should see `✅ MongoDB Connected`.
2. Optional system-wide fix: find out why Node sees 127.0.0.1. Common causes are a local DNS proxy, VPN or ad-blocker software, or an IPv6 DNS entry. You could also set the adapter's DNS to 8.8.8.8/1.1.1.1 and run `ipconfig /flushdns`. After that you can remove `DNS_SERVERS` from `.env`.

## 7. Production safety
I didn't touch any Vercel settings, environment variables, or deployment, and `MONGO_URI` is unchanged. The code change does nothing unless `DNS_SERVERS` is set. No database writes, no commits, no pushes. Frontend files were left as they were.
