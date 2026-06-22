# Deployment Steps: Railway

## Before You Start — Checklist

Confirm the following are already in place (they are, based on the current project state):

- [x] `.gitignore` contains `node_modules` and `.env`
- [x] `package.json` has `"start": "node server.js"`
- [x] All secrets are in `.env` (not hardcoded in `server.js`)
- [x] `.env.example` exists with placeholder values (safe to commit)

---

## Step 1 — Push the Project to GitHub

Railway deploys directly from a GitHub repository.

**1.1** Go to [github.com](https://github.com) → sign in → click **New repository**

**1.2** Name it (e.g., `HW_light_control`) → set to **Private** → click **Create repository**

**1.3** In your project folder, open a terminal and run:

```bash
cd "C:\Users\66850\Desktop\Year3Term2\newnew\HW_light_control"
git remote add origin https://github.com/<your-username>/HW_light_control.git
git add .
git commit -m "initial commit"
git push -u origin dev
```

> Replace `<your-username>` with your GitHub username.
> We push the `dev` branch because that is the active branch.

**1.4** Verify on GitHub that these files are **not** present in the repo (they should be gitignored):
- `.env`
- `node_modules/`

---

## Step 2 — Create a Railway Account

**2.1** Go to [railway.app](https://railway.app)

**2.2** Click **Login** → choose **Login with GitHub**

**2.3** Authorise Railway to access your GitHub account when prompted

> Using GitHub login links your Railway account to GitHub, which enables one-click repo connection in the next step.

---

## Step 3 — Create a New Railway Project

**3.1** After logging in, click **New Project** (top-right or centre of the dashboard)

**3.2** Select **Deploy from GitHub repo**

**3.3** If prompted, click **Configure GitHub App** → select your GitHub account → select the `HW_light_control` repository → click **Save**

**3.4** Back in Railway, select the `HW_light_control` repository from the list

**3.5** Railway asks which branch to deploy — select **`dev`**

**3.6** Click **Deploy Now**

Railway will:
- Clone your repo
- Run `npm install` (detected from `package.json`)
- Run `node server.js` (from the `start` script)
- Assign a public HTTPS URL

The first deploy takes about 1–2 minutes.

---

## Step 4 — Add Environment Variables

The `.env` file is not in the repo (gitignored), so you must add the variables manually in Railway.

**4.1** In your Railway project, click on the service (the box that appeared after deploy)

**4.2** Go to the **Variables** tab

**4.3** Click **Raw Editor** — this lets you paste all variables at once

**4.4** Paste the following, replacing each value with your real credentials:

```
TUYA_CLIENT_ID=qt4vvey4rwnxtu8we7hw
TUYA_SECRET=3a351da290654986981e7b5ca384e9cd
TUYA_BASE_URL=https://openapi-sg.iotbing.com
DEVICE_SW1=a3e863268d4c0d259dqtbe
DEVICE_SW2=a33a1415dc4aeb626az6ba
DEVICE_SW3=a376073de72bb6b235bbln
DEVICE_SW4=a3e59fd6e1dab69fc1sqpc
```

> Do **not** add `PORT` — Railway injects its own port automatically via the `PORT` environment variable, which the server already reads (`process.env.PORT || 3000`).

**4.5** Click **Update Variables**

Railway will automatically redeploy the service with the new variables. Wait about 30–60 seconds.

---

## Step 5 — Get Your Public URL

**5.1** In the Railway service, go to the **Settings** tab

**5.2** Scroll to the **Networking** section → click **Generate Domain**

Railway assigns a URL in the format:
```
https://hw-light-control-<random>.up.railway.app
```

**5.3** Click the URL to open it — you should see the SmartControl dashboard load

---

## Step 6 — Verify the Deployment

**6.1** Open your Railway URL in the browser — the dashboard should load and show all 8 zone switches

**6.2** Check the health endpoint — open a new tab and go to:
```
https://<your-railway-url>/health
```
You should see:
```json
{ "status": "ok" }
```

**6.3** Check live device state:
```
https://<your-railway-url>/switches/state
```
You should see both channels for all 4 devices with `true` or `false` values.

**6.4** Test a switch — click any zone button in the dashboard and confirm the light state changes on the device

---

## Step 7 — Check Logs (If Something Goes Wrong)

**7.1** In Railway, click on the service → go to the **Logs** tab

**7.2** Look for the startup message:
```
Server running on http://localhost:XXXX
```
If you see this, the server started correctly.

**7.3** Common errors and fixes:

| Log message | Cause | Fix |
|---|---|---|
| `Missing required env vars` | Variables not added or typo in name | Re-check Step 4 |
| `Token fetch failed` | Wrong `TUYA_CLIENT_ID` or `TUYA_SECRET` | Verify credentials in Tuya IoT Platform |
| `Cannot find module` | `npm install` failed | Check the Build logs tab for errors |
| Service restarts in a loop | Crash on startup | Read the full error in Logs |

---

## Step 8 — Set Up Auto-Deploy (Already Enabled by Default)

Railway automatically redeploys whenever you push to the connected branch (`dev`).

To test this:
```bash
git add .
git commit -m "test auto-deploy"
git push origin dev
```

Watch the Railway dashboard — a new deployment starts within seconds of the push.

To deploy a different branch later, go to the service → **Settings** → **Source** → change the branch.

---

## Summary

| Step | Action |
|---|---|
| 1 | Push project to GitHub (`dev` branch) |
| 2 | Create Railway account via GitHub login |
| 3 | New Project → Deploy from GitHub → select repo → select `dev` branch |
| 4 | Add all 7 environment variables in the Variables tab |
| 5 | Generate a public domain in Settings → Networking |
| 6 | Open the URL, check `/health` and `/switches/state` |
| 7 | Use the Logs tab if anything fails |
| 8 | Auto-deploy is on — every `git push origin dev` redeploys automatically |
