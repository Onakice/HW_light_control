# Light Control

A Node.js web application to monitor and control four Tuya smart switches from a browser.

## Overview

The server communicates with the Tuya OpenAPI using HMAC-SHA256 signed requests and automatically refreshes its access token before it expires. A dark-themed dashboard is served directly by the Express server.

**Features:**
- Control 4 smart switches (SW1–SW4) individually
- Live state polling — dashboard auto-refreshes every 10 seconds
- Optimistic UI feedback on button clicks
- Token auto-refresh — no manual token management needed

## Prerequisites

- Node.js v18 or newer
- npm (bundled with Node.js)
- A Tuya IoT Platform project with linked devices
- Your Tuya Client ID and Secret from the platform console

## Project Structure

```
HW_light_control/
├── server.js          # Express server + Tuya API logic
├── public/
│   └── index.html     # Web dashboard (served on /)
├── package.json
└── README.md
```

## Installation

```bash
npm install
```

## Configuration

Open `server.js` and update the constants at the top:

```js
const CLIENT_ID = 'your_client_id';
const SECRET    = 'your_secret_key';
const BASE_URL  = 'https://openapi-sg.iotbing.com'; // change to your region

const DEVICES = {
  sw1: 'device_id_for_switch_1',
  sw2: 'device_id_for_switch_2',
  sw3: 'device_id_for_switch_3',
  sw4: 'device_id_for_switch_4',
};
```

**Where to find your credentials:**
- `CLIENT_ID` / `SECRET` — Tuya IoT Platform → Cloud → your project → Overview tab
- `DEVICE_ID` — Tuya IoT Platform → Cloud → your project → Devices tab

**Base URL by region:**

| Region | URL |
|---|---|
| Singapore | `https://openapi-sg.iotbing.com` |
| US West | `https://openapi.tuyaus.com` |
| Europe | `https://openapi.tuyaeu.com` |
| China | `https://openapi.tuyacn.com` |
| India | `https://openapi.tuyain.com` |

## Running

```bash
node server.js
```

Then open **http://localhost:3000** in your browser.

> The server must be running whenever you want to use the dashboard. Opening `index.html` directly as a file will not work.

## Web Dashboard

Each switch card shows:
- Switch name and device ID
- Current state (**ON** / **OFF**) with a colour-coded indicator dot
- **ON** and **OFF** buttons
- An inline error message if a request fails

The **Refresh All** button fetches live state of all four switches. The page also polls automatically every 10 seconds.

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the web dashboard |
| `GET` | `/health` | Health check — returns `{ status: "ok" }` |
| `GET` | `/switch/:sw/state` | Returns `{ sw, state: true/false }` for one switch |
| `GET` | `/switches/state` | Returns state of all four switches |
| `POST` | `/switch/:sw/on` | Turns the specified switch ON |
| `POST` | `/switch/:sw/off` | Turns the specified switch OFF |

`:sw` is one of `sw1`, `sw2`, `sw3`, `sw4`.

## How It Works

### Authentication

Tuya OpenAPI requires every request to be signed with HMAC-SHA256.

**Token endpoint** — signed without an access token:
```
sign_input = CLIENT_ID + timestamp + stringToSign
```

**All other endpoints** — signed with the access token:
```
sign_input = CLIENT_ID + ACCESS_TOKEN + timestamp + stringToSign
```

Access tokens are valid for 7200 seconds. The server caches the token and fetches a new one 60 seconds before expiry automatically.

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
| Dashboard shows blank / `Cannot GET /` | Open `http://localhost:3000`, not the HTML file directly |
| All cards show `—` | Token fetch failed — check `CLIENT_ID` and `SECRET` |
| Cards show `Failed to fetch state` | Device ID is wrong or the device is offline |
| `Port 3000 already in use` | Stop the other process or change the port in `server.js` |
| `Token fetch failed` in console | Wrong credentials or `BASE_URL` doesn't match your region |

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `axios` | HTTP client for Tuya API calls |
| `crypto` | HMAC-SHA256 signing (Node.js built-in) |
