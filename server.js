const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CLIENT_ID = "qt4vvey4rwnxtu8we7hw";
const SECRET = "3a351da290654986981e7b5ca384e9cd";
const BASE_URL = "https://openapi-sg.iotbing.com";

const DEVICES = {
  sw1: "a3e863268d4c0d259dqtbe",
  sw2: "a33a1415dc4aeb626az6ba",
  sw3: "a376073de72bb6b235bbln",
  sw4: "a3e59fd6e1dab69fc1sqpc",
};

// ─── Token cache ─────────────────────────────────────────────────────────────
let tokenCache = { access_token: null, expires_at: 0 };

// ─── Signing helpers ──────────────────────────────────────────────────────────
function hmac(secret, str) {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}

// stringToSign = HTTPMethod\n SHA256(body)\n\n path
function buildStringToSign(method, path, body = "") {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return `${method}\n${bodyHash}\n\n${path}`;
}

// ─── Token management ─────────────────────────────────────────────────────────
// Token endpoint is signed WITHOUT access_token in the string:
//   sign_str = CLIENT_ID + t + stringToSign
async function getAccessToken() {
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at) {
    return tokenCache.access_token;
  }

  const apiPath = "/v1.0/token?grant_type=1";
  const t = Date.now().toString();
  const strToSign = buildStringToSign("GET", apiPath);
  const signStr = hmac(SECRET, CLIENT_ID + t + strToSign);

  const resp = await axios.get(BASE_URL + apiPath, {
    headers: {
      client_id: CLIENT_ID,
      t,
      sign: signStr,
      sign_method: "HMAC-SHA256",
    },
  });

  if (!resp.data.success) {
    throw new Error(`Token fetch failed: ${JSON.stringify(resp.data)}`);
  }

  const { access_token, expire_time } = resp.data.result;
  // Refresh 60 s before actual expiry
  tokenCache = { access_token, expires_at: Date.now() + (expire_time - 60) * 1000 };
  console.log("[token] refreshed, expires in", expire_time, "s");
  return access_token;
}

// ─── Generic request ──────────────────────────────────────────────────────────
// Regular endpoints signed WITH access_token:
//   sign_str = CLIENT_ID + access_token + t + stringToSign
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

  if (method !== "GET" && body) {
    config.data = body;
  }

  const resp = await axios(config);
  return resp.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveDevice(sw) {
  const id = DEVICES[sw];
  if (!id) throw Object.assign(new Error(`Unknown switch: ${sw}`), { status: 400 });
  return id;
}

// Extract switch_1 boolean from a /status response
function parseState(data) {
  if (!data.success) return null;
  const item = (data.result || []).find((s) => s.code === "switch_1");
  return item ? item.value : null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /switch/:sw/on   — turn on one switch
app.post("/switch/:sw/on", async (req, res) => {
  try {
    const deviceId = resolveDevice(req.params.sw);
    const body = JSON.stringify({ commands: [{ code: "switch_1", value: true }] });
    const data = await tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// POST /switch/:sw/off  — turn off one switch
app.post("/switch/:sw/off", async (req, res) => {
  try {
    const deviceId = resolveDevice(req.params.sw);
    const body = JSON.stringify({ commands: [{ code: "switch_1", value: false }] });
    const data = await tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// GET /switch/:sw/state — state of one switch (returns { sw, state: true/false })
app.get("/switch/:sw/state", async (req, res) => {
  try {
    const sw = req.params.sw;
    const deviceId = resolveDevice(sw);
    const data = await tuyaRequest("GET", `/v1.0/iot-03/devices/${deviceId}/status`);
    res.json({ sw, state: parseState(data), raw: data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.response?.data || err.message });
  }
});

// GET /switches/state   — state of all switches (returns { sw1: bool, sw2: bool, ... })
app.get("/switches/state", async (req, res) => {
  try {
    const results = {};
    for (const [sw, deviceId] of Object.entries(DEVICES)) {
      const data = await tuyaRequest("GET", `/v1.0/iot-03/devices/${deviceId}/status`);
      results[sw] = parseState(data);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// GET /health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
