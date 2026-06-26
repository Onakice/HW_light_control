require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const path = require("path");

const mqtt = require('mqtt');

MQTT_BROKER = "192.168.88.253";
MQTT_PORT = 1883;

const mqttClient = mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Config (all from .env) ───────────────────────────────────────────────────
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const SECRET    = process.env.TUYA_SECRET;
const BASE_URL  = process.env.TUYA_BASE_URL;
const PORT      = process.env.PORT || 3000;

if (!CLIENT_ID || !SECRET || !BASE_URL) {
  console.error("Missing required env vars: TUYA_CLIENT_ID, TUYA_SECRET, TUYA_BASE_URL");
  process.exit(1);
}

// Each physical device exposes switch_1 and switch_2
const DEVICES = {
  sw1: process.env.DEVICE_SW1,
  sw2: process.env.DEVICE_SW2,
  sw3: process.env.DEVICE_SW3,
  sw4: process.env.DEVICE_SW4,
};

// ─── Token cache ──────────────────────────────────────────────────────────────
let tokenCache = { access_token: null, expires_at: 0 };

// ─── Signing helpers ──────────────────────────────────────────────────────────
function hmac(secret, str) {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}

// stringToSign = HTTPMethod\n SHA256(body)\n\n path
function buildStringToSign(method, apiPath, body = "") {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return `${method}\n${bodyHash}\n\n${apiPath}`;
}

// ─── Token management ─────────────────────────────────────────────────────────
// Token endpoint signed WITHOUT access_token:
//   sign_input = CLIENT_ID + t + stringToSign
async function getAccessToken() {
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at) {
    return tokenCache.access_token;
  }

  const apiPath = "/v1.0/token?grant_type=1";
  const t = Date.now().toString();
  const strToSign = buildStringToSign("GET", apiPath);
  const signStr = hmac(SECRET, CLIENT_ID + t + strToSign);

  const resp = await axios.get(BASE_URL + apiPath, {
    headers: { client_id: CLIENT_ID, t, sign: signStr, sign_method: "HMAC-SHA256" },
  });

  if (!resp.data.success) {
    throw new Error(`Token fetch failed: ${JSON.stringify(resp.data)}`);
  }

  const { access_token, expire_time } = resp.data.result;
  tokenCache = { access_token, expires_at: Date.now() + (expire_time - 60) * 1000 };
  console.log(`[token] refreshed, expires in ${expire_time}s`);
  return access_token;
}

// ─── Generic signed request ───────────────────────────────────────────────────
// Regular endpoints signed WITH access_token:
//   sign_input = CLIENT_ID + access_token + t + stringToSign
async function tuyaRequest(method, apiPath, body = "") {
  const token = await getAccessToken();
  const t = Date.now().toString();
  const strToSign = buildStringToSign(method, apiPath, body);
  const signStr = hmac(SECRET, CLIENT_ID + token + t + strToSign);

  const config = {
    method,
    url: BASE_URL + apiPath,
    headers: {
      client_id: CLIENT_ID,
      access_token: token,
      t,
      sign: signStr,
      sign_method: "HMAC-SHA256",
      "Content-Type": "application/json",
    },
  };
  if (method !== "GET" && body) config.data = body;

  const resp = await axios(config);
  return resp.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveDevice(sw) {
  const id = DEVICES[sw];
  if (!id) throw Object.assign(new Error(`Unknown switch: ${sw}`), { status: 400 });
  return id;
}

function resolveChannel(ch) {
  if (ch !== "1" && ch !== "2") {
    throw Object.assign(new Error(`Channel must be 1 or 2, got: ${ch}`), { status: 400 });
  }
  return `switch_${ch}`;
}

// Extract a specific channel value from a /status response
function parseChannel(data, channelCode) {
  if (!data.success) return null;
  const item = (data.result || []).find((s) => s.code === channelCode);
  return item !== undefined ? item.value : null;
}

// Extract both switch_1 and switch_2 from a /status response
function parseAllChannels(data) {
  if (!data.success) return { switch_1: null, switch_2: null };
  const result = data.result || [];
  const get = (code) => { const r = result.find(s => s.code === code); return r ? r.value : null; };
  return { switch_1: get("switch_1"), switch_2: get("switch_2") };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /switch/:sw/:channel/on   — e.g. POST /switch/sw1/1/on  (channel = 1 or 2)
app.post("/switch/:sw/:channel/on", async (req, res) => {
  try {
    const deviceId = resolveDevice(req.params.sw);
    const code = resolveChannel(req.params.channel);
    const body = JSON.stringify({ commands: [{ code, value: true }] });
    const data = await tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// POST /switch/:sw/:channel/off
app.post("/switch/:sw/:channel/off", async (req, res) => {
  try {
    const deviceId = resolveDevice(req.params.sw);
    const code = resolveChannel(req.params.channel);
    const body = JSON.stringify({ commands: [{ code, value: false }] });
    const data = await tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// GET /switch/:sw/state   — returns { sw, switch_1: bool, switch_2: bool }
app.get("/switch/:sw/state", async (req, res) => {
  try {
    const sw = req.params.sw;
    const deviceId = resolveDevice(sw);
    const data = await tuyaRequest("GET", `/v1.0/iot-03/devices/${deviceId}/status`);
    res.json({ sw, ...parseAllChannels(data) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// GET /switches/state   — returns state of all devices, both channels
// { sw1: { switch_1: bool, switch_2: bool }, sw2: { ... }, ... }
app.get("/switches/state", async (req, res) => {
  try {
    const results = {};
    for (const [sw, deviceId] of Object.entries(DEVICES)) {
      const data = await tuyaRequest("GET", `/v1.0/iot-03/devices/${deviceId}/status`);
      results[sw] = parseAllChannels(data);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post("/api/room504/ac/servo/press", async(req, res) => {
  try{
    const topic = 'room504/ac/servo';
    const message = req.body.action || 'CLOSE';
  mqttClient.publish(topic, message, (err) => {
        if (err) {
          console.error('Publish error:', err);
          return res.status(500).json({ success: false, error: 'MQTT Error' });
        }
        
        console.log('${topic} Success');
        res.json({ success: true, message: 'Servo Success' });
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

app.post("/api/room503/ac/servo/press", async(req, res) => {
  try{
    const topic = 'room503/ac/servo';
    const message = req.body.action || 'CLOSE';
  mqttClient.publish(topic, message, (err) => {
        if (err) {
          console.error('Publish error:', err);
          return res.status(500).json({ success: false, error: 'MQTT Error' });
        }
        
        console.log('${topic} Success');
        res.json({ success: true, message: 'Servo Success' });
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

// GET /health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
