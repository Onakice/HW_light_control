# Light Control — ECC 503 & 504

A Node.js web application for monitoring and controlling Tuya smart switches in rooms ECC 503 and 504, served through a browser dashboard.

## Overview

The Express server communicates with the Tuya OpenAPI using HMAC-SHA256 signed requests. Access tokens are fetched automatically and refreshed before expiry — no manual token management needed. The web dashboard mirrors the physical room layout and reflects live device state.

**Current status:**
- Room 504 — fully implemented (8 logical zones → 4 Tuya devices)
- Room 503 — UI placeholder only, not yet wired to hardware

## Prerequisites

- Node.js v18 or newer
- npm
- A Tuya IoT Platform project with the 4 switch devices linked

## Project Structure

```
HW_light_control/
├── server.js          # Express server + Tuya OpenAPI logic
├── public/
│   └── index.html     # Web dashboard (room layout, switch panels, AC controls)
├── .env               # Secrets — never commit this
├── .env.example       # Safe template for onboarding
├── package.json
└── README.md
```

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
TUYA_CLIENT_ID=your_client_id
TUYA_SECRET=your_secret_key
TUYA_BASE_URL=https://openapi-sg.iotbing.com
PORT=3000

DEVICE_SW1=device_id_for_sw1
DEVICE_SW2=device_id_for_sw2
DEVICE_SW3=device_id_for_sw3
DEVICE_SW4=device_id_for_sw4
```

**Where to find credentials:**
- `TUYA_CLIENT_ID` / `TUYA_SECRET` — Tuya IoT Platform → Cloud → your project → Overview
- `DEVICE_SW*` — Tuya IoT Platform → Cloud → your project → Devices tab

**Base URL by region:**

| Region | URL |
|---|---|
| Singapore (current) | `https://openapi-sg.iotbing.com` |
| US West | `https://openapi.tuyaus.com` |
| Europe | `https://openapi.tuyaeu.com` |
| China | `https://openapi.tuyacn.com` |
| India | `https://openapi.tuyain.com` |

## Running

```bash
node server.js
```

Open **http://localhost:3000** in your browser.

> The server must be running to use the dashboard. Do not open `index.html` as a file directly.

## Switch Mapping (Room 504)

Each physical Tuya device has two channels (`switch_1`, `switch_2`). The mapping to logical zones is:

| Zone (UI) | Device | Channel |
|---|---|---|
| Special | sw1 | switch_1 |
| zone-1 | sw1 | switch_2 |
| zone-2 | sw2 | switch_1 |
| zone-3 | sw2 | switch_2 |
| zone-4 | sw3 | switch_1 |
| zone-5 | sw3 | switch_2 |
| zone-6 | sw4 | switch_1 |
| zone-7 | sw4 | switch_2 |

This mapping is defined at the top of `public/index.html` in the `SWITCH_TO_DEVICE` constant and can be updated when wiring changes.

Room 503 switches (Sw-1 to Sw-4) are shown in the UI but set to `null` in `SWITCH_TO_DEVICE` — they are grayed out and make no API calls until hardware is installed.

## Web Dashboard

The dashboard replicates the physical room layout:

- **Switch panel** — click any zone button to toggle it; grayed-out buttons are not yet wired
- **Light grid** — each cell reflects the live state of its controlling zone switch
- **AC controls** — UI-only state for now (not connected to Tuya)
- **Left sidebar** — shows count of lights currently on
- **Right sidebar** — row-by-row controls for room 504
- **Auto-refresh** — polls all device states every 10 seconds; optimistic UI on button clicks

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web dashboard |
| `GET` | `/health` | Health check → `{ status: "ok" }` |
| `GET` | `/switch/:sw/state` | State of one device → `{ sw, switch_1: bool, switch_2: bool }` |
| `GET` | `/switches/state` | State of all 4 devices |
| `POST` | `/switch/:sw/:channel/on` | Turn a channel ON |
| `POST` | `/switch/:sw/:channel/off` | Turn a channel OFF |

`:sw` = `sw1`–`sw4`, `:channel` = `1` or `2`

## How It Works

### Signing

Tuya OpenAPI requires every request to be signed with HMAC-SHA256.

**Token endpoint** (no access token yet):
```
sign_input = CLIENT_ID + timestamp + stringToSign
```

**All other endpoints** (with access token):
```
sign_input = CLIENT_ID + ACCESS_TOKEN + timestamp + stringToSign
```

Where `stringToSign = METHOD\n SHA256(body)\n\n path`.

### Token Refresh

Access tokens expire after 7200 seconds. The server caches the token and fetches a new one automatically 60 seconds before expiry.

### Device Commands

```
POST /v1.0/iot-03/devices/{device_id}/commands
Body: { "commands": [{ "code": "switch_1", "value": true }] }
```

### Device Status

```
GET /v1.0/iot-03/devices/{device_id}/status
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard shows blank page | Open `http://localhost:3000`, not the HTML file directly |
| All lights show `—` or loading forever | Token fetch failed — check `TUYA_CLIENT_ID` and `TUYA_SECRET` in `.env` |
| A zone switch is grayed out | That zone is set to `null` in `SWITCH_TO_DEVICE` — update the mapping |
| Light state doesn't match reality | Click the switch again; the device may have been toggled physically |
| Port 3000 already in use | Change `PORT` in `.env` or stop the conflicting process |
| `Token fetch failed` in console | Wrong credentials or `TUYA_BASE_URL` doesn't match your account region |

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `axios` | HTTP client for Tuya API calls |
| `dotenv` | Loads `.env` into `process.env` |
| `crypto` | HMAC-SHA256 signing (Node.js built-in) |
