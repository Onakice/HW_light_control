# Deployment Plan: Light Control on Vercel

## The Core Challenge

Vercel is a **serverless** platform. It does not run a persistent Node.js process — instead, each incoming request triggers a short-lived function that spins up, handles the request, and shuts down.

This creates two problems for the current project:

1. **In-memory token cache is lost** between requests. `server.js` stores the Tuya access token in a variable (`let tokenCache = ...`). On a serverless platform this variable is wiped after every cold start, so a new token must be fetched from Tuya on the first request after each idle period (~200ms extra latency per cold start).

2. **The Express server cannot run as-is.** Vercel does not `node server.js`. You must either wrap Express for serverless or rewrite the routes as native Vercel functions.

---

## Approach A — Wrap Express as a Serverless Function (Quickest)

**Concept:** Export the Express `app` object from `server.js` and let Vercel invoke it as a function. A `vercel.json` config routes every request through it. Static files in `public/` are served by Vercel's CDN directly.

### Steps

**1. Refactor `server.js` — separate app from `listen`**

Split the file so the Express app is exported (for Vercel) but still starts a local server when run directly.

```js
// server.js — change the bottom from:
app.listen(PORT, () => console.log(...));

// to:
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
```

**2. Create `api/index.js`**

```js
// api/index.js
module.exports = require("../server");
```

Vercel looks for files in `api/` and wraps them as serverless functions automatically.

**3. Create `vercel.json`**

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/public/(.*)", "dest": "/public/$1" },
    { "src": "/(.*)",        "dest": "/api/index.js" }
  ]
}
```

**4. Move `public/index.html` to root as `index.html`**

Vercel serves files in the project root as static assets. Move the dashboard file so the `/` route serves it from the CDN rather than through Express.

Alternatively, configure the static output directory in `vercel.json`:

```json
{
  "outputDirectory": "public"
}
```

> Note: This conflicts with routing everything to the Express function. The cleanest solution is to keep the HTML at the root level and only route `/switch/*`, `/switches/*`, and `/health` through the function (see Approach B).

**5. Add environment variables in Vercel dashboard**

Go to your Vercel project → Settings → Environment Variables and add:

```
TUYA_CLIENT_ID
TUYA_SECRET
TUYA_BASE_URL
DEVICE_SW1
DEVICE_SW2
DEVICE_SW3
DEVICE_SW4
```

Do not add `PORT` — Vercel ignores it.

**6. Deploy**

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Pros
- Minimal code changes (2 small edits + 2 new files)
- Familiar Express structure is preserved

### Cons
- Token cache is lost on cold starts → ~200ms extra latency occasionally
- Entire Express bundle is sent to Vercel on every cold start (slightly slower than native functions)
- Static HTML served through Express (not CDN) unless the routing is tuned carefully

---

## Approach B — Native Vercel API Functions (Recommended)

**Concept:** Delete the Express server entirely. Each route becomes a separate file under `api/`. Static files (`public/index.html`) are served by Vercel's CDN directly at no extra latency. Shared Tuya logic lives in a helper module.

### Steps

**1. Create `lib/tuya.js` — shared signing and request logic**

Extract `hmac`, `buildStringToSign`, `getAccessToken`, and `tuyaRequest` from `server.js` into a shared module. This file is not an API route — it is just a helper.

```
lib/
└── tuya.js     ← signing, token fetch, tuyaRequest
```

The token cache (`let tokenCache = ...`) stays in this file. It will be reset on cold starts but reused across warm invocations of any function that imports it.

**2. Create one file per API route**

```
api/
├── health.js                        GET  /api/health
├── switches/
│   └── state.js                     GET  /api/switches/state
└── switch/
    └── [sw]/
        ├── state.js                 GET  /api/switch/:sw/state
        └── [channel]/
            ├── on.js                POST /api/switch/:sw/:channel/on
            └── off.js               POST /api/switch/:sw/:channel/off
```

Each file exports a single default function:

```js
// api/switch/[sw]/[channel]/on.js
import { tuyaRequest } from "../../../lib/tuya.js";

const DEVICES = {
  sw1: process.env.DEVICE_SW1,
  sw2: process.env.DEVICE_SW2,
  sw3: process.env.DEVICE_SW3,
  sw4: process.env.DEVICE_SW4,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { sw, channel } = req.query;
  const deviceId = DEVICES[sw];
  if (!deviceId) return res.status(400).json({ error: `Unknown switch: ${sw}` });
  if (channel !== "1" && channel !== "2")
    return res.status(400).json({ error: "Channel must be 1 or 2" });

  const code = `switch_${channel}`;
  const body = JSON.stringify({ commands: [{ code, value: true }] });
  const data = await tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, body);
  res.json(data);
}
```

**3. Update `public/index.html` — change API base path**

The frontend currently calls `/switch/sw1/state`. On Vercel, API routes live under `/api/`, so update all fetch calls:

```js
// Before
fetch(`/switch/${sw}/state`)
fetch(`/switches/state`)
fetch(`/switch/${sw}/${ch}/${action}`, { method: "POST" })

// After
fetch(`/api/switch/${sw}/state`)
fetch(`/api/switches/state`)
fetch(`/api/switch/${sw}/${ch}/${action}`, { method: "POST" })
```

**4. Create `vercel.json`**

Static files in `public/` are served automatically. Only API traffic needs routing:

```json
{
  "version": 2
}
```

Vercel automatically routes `api/**` to the functions and everything else to static files in `public/`.

**5. Add environment variables** (same as Approach A, step 5)

**6. Deploy**

```bash
vercel --prod
```

### Pros
- Static dashboard served from Vercel's global CDN (fast, no function cold start for the HTML)
- Each function is small and starts faster than the full Express bundle
- Clean serverless architecture

### Cons
- More files to create (one per route)
- API paths change from `/switch/...` to `/api/switch/...` (one-time frontend update)
- Token cache still lost on cold starts (same limitation as Approach A)

---

## Approach C — Approach B + Vercel KV for Token Cache (Most Robust)

**Concept:** Same as Approach B but the Tuya access token is stored in **Vercel KV** (a managed Redis service) instead of a module-level variable. Every function invocation reads the cached token from KV before deciding whether to re-fetch.

### Additional Steps on top of Approach B

**1. Enable Vercel KV**

In the Vercel dashboard → Storage → Create KV database → link it to your project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your environment automatically.

**2. Install the KV client**

```bash
npm install @vercel/kv
```

**3. Update `lib/tuya.js` to use KV**

```js
import { kv } from "@vercel/kv";

async function getAccessToken() {
  // Try KV first
  const cached = await kv.get("tuya_token");
  if (cached) return cached;

  // Fetch fresh token from Tuya
  const { access_token, expire_time } = await fetchTokenFromTuya();

  // Store in KV with TTL (expire 60s early)
  await kv.set("tuya_token", access_token, { ex: expire_time - 60 });
  return access_token;
}
```

### Pros
- Token is cached globally across all function instances and cold starts
- No extra Tuya API call overhead once the token is cached
- Production-grade solution

### Cons
- Vercel KV is a paid add-on above the free tier (25,000 requests/day free)
- Adds `@vercel/kv` dependency and slightly more complex token logic
- Overkill for a low-traffic internal tool

---

## Comparison

| | Approach A | Approach B | Approach C |
|---|---|---|---|
| Code changes | Small | Moderate | Moderate + KV setup |
| Static file delivery | Through Express | Vercel CDN | Vercel CDN |
| Token caching | In-memory (lost on cold start) | In-memory (lost on cold start) | Vercel KV (persistent) |
| Cold start latency | ~300–500ms | ~100–200ms | ~100–200ms |
| Extra services needed | None | None | Vercel KV (paid above free tier) |
| Best for | Quick prototype deployment | Clean production setup | High-availability production |

---

## Recommendation

**Start with Approach B.**

It is the right architecture for Vercel with only moderate changes:

1. Extract Tuya logic into `lib/tuya.js`
2. Create 5 small function files under `api/`
3. Update 3 fetch paths in `public/index.html`
4. Add env vars in the Vercel dashboard
5. Run `vercel --prod`

The token cold-start cost (~200ms once per idle period) is acceptable for an internal room-control dashboard. If it becomes a problem later, add Vercel KV (Approach C) as a drop-in upgrade to `lib/tuya.js` only.

**Approach A is fine if you want to ship in 10 minutes** and don't mind slightly messier static file handling.

---

## What Will NOT Work Without Changes

- The in-process `let tokenCache` will always be reset on cold starts regardless of approach — this is a property of serverless, not a bug
- `app.listen()` will silently fail on Vercel and must be guarded with `if (require.main === module)`
- The `PORT` env var is ignored by Vercel
- `dotenv` / `.env` files are not loaded by Vercel — env vars must be set in the Vercel dashboard or via `vercel env pull`

---

*Confirm which approach you'd like to proceed with and I'll implement it.*
