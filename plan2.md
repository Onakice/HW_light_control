# Platform Evaluation: Render vs Railway vs Fly.io

## Why These Platforms Suit This Project Better Than Vercel

Vercel is serverless — it cannot keep a Node.js process alive between requests. That means the in-memory Tuya token cache is wiped on every cold start and `app.listen()` must be removed. These platforms are different: they run a **persistent process** (`node server.js` stays alive), so the token cache works exactly as written and zero code changes are needed.

---

## Project Profile (What Matters for the Comparison)

| Property | Value |
|---|---|
| Runtime | Node.js (Express) |
| Start command | `node server.js` |
| Persistent state | In-memory token cache only — no database, no disk |
| Traffic | Very low (internal dashboard, handful of users) |
| Uptime requirement | Should respond instantly — spin-down delays are painful for a light switch |
| External calls | Outbound HTTPS to Tuya OpenAPI |
| Config | Environment variables |
| Code changes needed | None for any of these platforms |

---

## Platform 1 — Render

### Overview
Render is a cloud platform with a simple Git-based deploy workflow. You connect a GitHub repo, set a start command, and Render builds and runs it.

### Free Tier
- **Web Service (free):** Runs your app, but **spins down after 15 minutes of inactivity**. The next request after an idle period waits 30–50 seconds for the process to wake up.
- **Paid Web Service:** $7/month — always-on, no spin-down.

### Setup Steps
1. Push project to GitHub (with `.env` excluded via `.gitignore`).
2. Create account at render.com → New → Web Service → connect repo.
3. Set **Build Command:** `npm install`
4. Set **Start Command:** `node server.js`
5. Add environment variables in the Render dashboard (Settings → Environment).
6. Deploy — Render detects Node.js automatically.

### Relevant Behaviour for This Project
- On the **free tier**, the spin-down is a serious problem. Pressing a light switch after the dashboard has been idle for 15 minutes will produce a 30–50 second wait before the first response. The Tuya token cache is also wiped on every wake-up, adding one extra token-fetch call.
- On the **paid tier ($7/month)**, the process stays alive indefinitely. Token cache persists. Response time is instant.

### Pros
- Cleanest UI of the three — very beginner-friendly
- Automatic TLS (HTTPS) on a `*.onrender.com` subdomain
- Auto-deploy on every GitHub push
- No Docker required

### Cons
- Free tier spin-down makes it **unreliable for a real-time control dashboard**
- Must pay $7/month for reliable always-on behaviour
- Slightly slower cold deploys compared to Railway

---

## Platform 2 — Railway

### Overview
Railway runs persistent containers from your GitHub repo. It detects the language, installs dependencies, and starts your app using the `start` script in `package.json`. No configuration files needed.

### Free Tier
- **$5 of compute credit per month** (no credit card required initially).
- A single always-on Node.js service with 512MB RAM uses roughly **$3–4/month** of credit — meaning it runs the full month on the free allowance with a small buffer.
- **No spin-down.** The process stays alive as long as credit remains.
- Paid plans start at $5/month for a fixed allocation.

### Setup Steps
1. Push project to GitHub.
2. Create account at railway.app → New Project → Deploy from GitHub repo → select repo.
3. Railway reads `package.json` and runs `npm start` automatically (`node server.js`).
4. Go to the service → Variables tab → add all environment variables from `.env`.
5. Railway assigns a public HTTPS URL automatically (`*.up.railway.app`).
6. Done — every push to the connected branch triggers a redeploy.

### Relevant Behaviour for This Project
- The process never sleeps on the free tier (within credit). Pressing a light switch gets an instant response every time.
- Token cache stays in memory between requests — no unnecessary re-fetches to Tuya.
- Environment variable UI is clean and supports bulk import (paste the contents of `.env` directly).
- Zero code changes required — Railway runs `node server.js` exactly as you do locally.

### Pros
- **Always-on for free** (within the $5/month credit — sufficient for this project)
- No spin-down at all
- Zero config files needed — reads `package.json` automatically
- One-click GitHub integration with auto-deploy
- Built-in HTTPS, environment variable management, and deploy logs
- Easiest path from local to production for a standard Node.js app

### Cons
- Free credit runs out if you add more services to the same account (e.g., a database)
- Less granular control over infrastructure compared to Fly.io
- `*.up.railway.app` subdomain (custom domain requires a paid plan)

---

## Platform 3 — Fly.io

### Overview
Fly.io runs your app inside a Docker container (or uses buildpacks) across a global network of machines. It is the most powerful of the three but also the most complex to set up.

### Free Tier
- **3 shared-cpu-1x VMs with 256MB RAM** — always-on, never spin down.
- Sufficient for this project on paper, but the free allowance is shared across all your Fly.io apps.
- Paid usage beyond the free VMs is billed per second.

### Setup Steps
1. Install the `flyctl` CLI: `winget install Fly.io.flyctl`
2. Log in: `flyctl auth login`
3. In the project directory: `flyctl launch`
   - Fly.io detects Node.js and generates a `Dockerfile` and `fly.toml` automatically.
   - Review and confirm the generated config.
4. Set environment variables:
   ```bash
   flyctl secrets set TUYA_CLIENT_ID=xxx TUYA_SECRET=yyy TUYA_BASE_URL=zzz \
     DEVICE_SW1=aaa DEVICE_SW2=bbb DEVICE_SW3=ccc DEVICE_SW4=ddd
   ```
5. Deploy: `flyctl deploy`
6. Fly.io assigns a `*.fly.dev` subdomain with HTTPS.

Subsequent deploys: `flyctl deploy` (or set up GitHub Actions for CI/CD).

### Relevant Behaviour for This Project
- Always-on, no spin-down, global edge deployment.
- Token cache persists between requests.
- The generated `Dockerfile` and `fly.toml` are new files that must be committed to the repo.
- Deployment requires the CLI — there is no one-click GitHub button by default (GitHub Actions integration is possible but needs manual setup).
- The added power (multiple regions, persistent volumes, private networking) is entirely unused by this project.

### Pros
- Always-on, never sleeps
- True containerised deployment — exactly what runs locally is what runs in production
- Most flexible and scalable of the three
- Good free tier for always-on workloads

### Cons
- **Steepest learning curve** — requires CLI, Docker knowledge, and `fly.toml` config
- Adds `Dockerfile` and `fly.toml` as new committed files
- CI/CD from GitHub requires manual GitHub Actions setup
- Overkill complexity for a simple single-service internal tool
- CLI-only deploys by default (no drag-and-drop or dashboard deploy)

---

## Side-by-Side Comparison

| Criterion | Render | Railway | Fly.io |
|---|---|---|---|
| Always-on (free) | No — 15 min spin-down | **Yes** (within $5 credit) | **Yes** (3 free VMs) |
| Code changes needed | None | None | None (but new config files) |
| Setup difficulty | Very easy | **Easiest** | Moderate–Hard |
| GitHub auto-deploy | Yes | Yes | Manual (CLI or Actions) |
| Token cache survives idle | No (free) / Yes (paid) | **Yes** | **Yes** |
| Response time after idle | 30–50s (free) | **Instant** | **Instant** |
| Custom domain | Free | Paid plan | Paid plan |
| HTTPS | Automatic | Automatic | Automatic |
| Environment variable UI | Good | **Excellent** (bulk paste) | CLI only |
| Monthly cost for reliability | $7 | ~$0–$5 | ~$0 |
| Best for | Simple projects (paid) | **Internal tools, prototypes** | Scaled production apps |

---

## Verdict

### Recommended: Railway

Railway is the right choice for this project. It requires the least setup, runs `node server.js` exactly as-is with no new files, stays always-on for free within the monthly credit, and has the best developer experience for a Node.js project of this size.

The entire deployment is:
1. Push to GitHub
2. Connect repo on railway.app
3. Paste environment variables
4. Done

**Render** is a close second and has a better-known brand, but its free tier spin-down makes it unsuitable for a light switch dashboard where a 30-second delay on the first press after an idle period is unacceptable. It becomes a good option at $7/month.

**Fly.io** is the right tool when you need multi-region deployment, persistent volumes, or complex networking — none of which apply here. The CLI-heavy workflow and required Docker config add friction without adding value for this project.

---

## If You Proceed with Railway — Implementation Checklist

- [ ] Ensure `.env` is in `.gitignore` (already done)
- [ ] Ensure `package.json` has `"start": "node server.js"` (already done)
- [ ] Push current `dev` branch to GitHub
- [ ] Create Railway account → New Project → Deploy from GitHub → select repo → select `dev` branch
- [ ] In Variables tab: add `TUYA_CLIENT_ID`, `TUYA_SECRET`, `TUYA_BASE_URL`, `DEVICE_SW1`–`DEVICE_SW4`
- [ ] Confirm deploy succeeds and public URL returns `{ status: "ok" }` from `/health`
- [ ] Update `public/index.html` fetch calls to use the Railway URL (or keep as relative paths if the frontend is served by the same process — which it is, so no change needed)

*Confirm which platform to proceed with and I will implement the deployment configuration.*
