# HW Light Control — ECC 503 & 504

A Node.js web application for monitoring and controlling Tuya smart switches in rooms ECC 503 and 504 via a browser dashboard.

## Overview

The Express server communicates with the Tuya OpenAPI using HMAC-SHA256 signed requests. Access tokens are fetched and refreshed automatically. The web dashboard mirrors the physical room layout and reflects live device state with 10-second auto-refresh and optimistic UI updates.

**Current status:**
- Room 504 — fully implemented (8 zones → sw1–sw4, 2 channels each)
- Room 503 — fully implemented (4 zones → sw5 single channel, sw6 3 channels)

## Project Structure

```
HW_light_control/
├── server.js          # Express server + Tuya OpenAPI logic
├── public/
│   └── index.html     # Web dashboard (room layout, switch panels, AC controls)
├── .env               # Secrets — never commit this
├── .env.example       # Safe template for onboarding
├── package.json
├── README.md
└── step.md            # Railway deployment guide
```

## Prerequisites

- Node.js v18 or newer
- npm
- A Tuya IoT Platform project with all 6 switch devices linked

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
DEVICE_SW5=device_id_for_sw5
DEVICE_SW6=device_id_for_sw6
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

## Switch Mapping

### Room 504

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

### Room 503

sw5 has 1 channel; sw6 has 3 channels.

| Zone (UI) | Device | Channel |
|---|---|---|
| Sw-1 | sw6 | switch_3 |
| Sw-2 | sw6 | switch_2 |
| Sw-3 | sw6 | switch_1 |
| Sw-4 | sw5 | switch_1 |

> The UI renders room 503 switches in reverse order so Sw-4 appears on the left (matching the physical layout).

The mapping is defined in `public/index.html` in the `SWITCH_TO_DEVICE` constant and can be updated when wiring changes.

## Web Dashboard

- **Switch panel** — click any zone button to toggle; button color reflects live state
- **Light grid** — each cell reflects the live state of its controlling zone switch
- **AC controls** — UI-only state (not yet connected to Tuya)
- **Left sidebar** — shows count of lights currently on
- **Right sidebar** — row-by-row controls for room 504
- **Auto-refresh** — polls all device states every 10 seconds
- **Optimistic UI** — switch state updates instantly on click, confirmed after 1 second

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web dashboard |
| `GET` | `/health` | Health check → `{ "status": "ok" }` |
| `GET` | `/switch/:sw/state` | State of one device → `{ sw, switch_1, switch_2, switch_3 }` |
| `GET` | `/switches/state` | State of all 6 devices |
| `POST` | `/switch/:sw/:channel/on` | Turn a channel ON |
| `POST` | `/switch/:sw/:channel/off` | Turn a channel OFF |

`:sw` = `sw1`–`sw6`, `:channel` = `1`, `2`, or `3`

### Example

```bash
# Turn on sw1 channel 1
curl -X POST http://localhost:3000/switch/sw1/1/on

# Check all device states
curl http://localhost:3000/switches/state
```

## How It Works

### Signing

Tuya OpenAPI requires every request to be signed with HMAC-SHA256.

**Token endpoint** (signed without access token):
```
sign_input = CLIENT_ID + timestamp + stringToSign
```

**All other endpoints** (signed with access token):
```
sign_input = CLIENT_ID + ACCESS_TOKEN + timestamp + stringToSign
```

Where `stringToSign = METHOD\n SHA256(body)\n\n path`.

### Token Refresh

Access tokens expire after 7200 seconds. The server caches the token and fetches a new one automatically 60 seconds before expiry — no manual intervention needed.

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
| A zone switch is grayed out | That zone has no mapping in `SWITCH_TO_DEVICE` |
| Light state doesn't match reality | Device may have been toggled physically; auto-refresh syncs every 10s |
| Port 3000 already in use | Change `PORT` in `.env` or stop the conflicting process |
| `Token fetch failed` in console | Wrong credentials or `TUYA_BASE_URL` doesn't match your account region |
| `Unknown switch` error | Device env var is missing or misspelled in `.env` |

## Deployment

See [step.md](step.md) for the full Railway deployment guide (free tier, always-on, auto-deploy from GitHub).

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `axios` | HTTP client for Tuya API calls |
| `dotenv` | Loads `.env` into `process.env` |
| `crypto` | HMAC-SHA256 signing (Node.js built-in) |

---

## Camera & AI Detection (`camera-detect/`)

ระบบกล้องทำงานแยกจาก Express server — เป็น Python script ที่รันอิสระบนเครื่องที่ติดตั้งกล้อง แล้วสั่งควบคุมไฟผ่าน API ของ server นี้

### ภาพรวม

```
IP Camera (RTSP)
      │
      ▼
detecthuman.py  ─── YOLOv8n ──► นับคนในเฟรม
      │
      ▼  (ถ้าไม่มีคนนานเกิน 30 นาที)
POST /switch/sw{n}/{ch}/off  ──► Express Server ──► Tuya API ──► ปิดไฟ
```

### ไฟล์

```
camera-detect/
└── HW_ai/
    ├── detecthuman.py   # Main script
    └── yolov8n.pt       # YOLOv8 nano model weights
```

### การทำงาน

1. **ต่อกล้อง RTSP** — ดึง stream จากกล้อง IP ในห้อง 504 (`192.168.88.95`)
2. **Frame skipping** — รัน AI ทุก 3 เฟรม เพื่อลดภาระ CPU/GPU
3. **YOLOv8n inference** — ตรวจจับเฉพาะ class 0 (person) ที่ confidence ≥ 0.4
4. **นับคนแบบ real-time** — แสดงจำนวนคนบนหน้าต่าง `cv2.imshow`
5. **Auto turn-off** — ถ้าไม่พบคนนานเกิน **30 นาที** ส่ง API ปิดไฟทุก channel (sw1–sw4, ch1–2) ใน background thread

### Logic สรุป

```
มีคน → รีเซ็ตนาฬิกา (last_movement_time = now)
ไม่มีคน + ผ่านมา 30 นาที → ยิง POST /switch/sw{1-4}/{1-2}/off ทุกตัว
                           → รีเซ็ตนาฬิกา (ไม่ให้ยิงซ้ำ)
```

### Prerequisites

```bash
pip install ultralytics opencv-python requests
```

- Python 3.8+
- ไฟล์ `yolov8n.pt` ต้องอยู่ในโฟลเดอร์เดียวกับ script
- กล้องต้องอยู่ใน network เดียวกับเครื่องที่รัน script

### Configuration

แก้ค่าตัวแปรบนสุดของ `detecthuman.py`:

| ตัวแปร | ค่าปัจจุบัน | คำอธิบาย |
|---|---|---|
| `RTSP_URL` | `rtsp://AiCam504_01:Hw_504_cam01@192.168.88.95:554/stream2` | URL กล้อง IP |
| `API_BASE_URL` | `https://hw-light-control.onrender.com` | URL ของ Express server |
| `SEND_INTERVAL` | `1800.0` (วินาที) | เวลารอก่อนปิดไฟ (30 นาที) |

### วิธีรัน

```bash
cd camera-detect/HW_ai
python detecthuman.py
```

กด `q` บนหน้าต่าง OpenCV เพื่อหยุด

### การ reconnect อัตโนมัติ

ถ้ากล้องหลุด (`cap.read()` คืนค่า `False`) script จะ:
1. ปล่อย capture object
2. รอ 2 วินาที
3. เชื่อมต่อใหม่อัตโนมัติ — ไม่ต้องรีสตาร์ตด้วยมือ
