const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());

const CLIENT_ID = "qt4vvey4rwnxtu8we7hw";
const SECRET = "3a351da290654986981e7b5ca384e9cd";
const ACCESS_TOKEN = "your_access_token"; // บาง flow ต้องใช้
const DEVICE_ID = "a3e863268d4c0d259dqtbe";

const BASE_URL = "https://openapi.tuyaap.com"; // region ต้องตรง

// 🔐 sign function
function sign(secret, str) {
  return crypto
    .createHmac("sha256", secret)
    .update(str)
    .digest("hex")
    .toUpperCase();
}

// 🕒 timestamp
function getTime() {
  return Date.now().toString();
}

// 🧠 build sign string (แบบ simplified ที่ใช้ได้กับ command API)
function buildString(method, path, body = "") {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");

  return `${method}\n${bodyHash}\n\n${path}`;
}

// 🔥 ON
app.post("/switch/on", async (req, res) => {
  try {
    const t = getTime();
    const path = `/v1.0/devices/${DEVICE_ID}/commands`;

    const body = JSON.stringify({
      commands: [{ code: "switch_1", value: true }],
    });

    const stringToSign = CLIENT_ID + ACCESS_TOKEN + t + buildString("POST", path, body);
    const signStr = sign(SECRET, stringToSign);

    const response = await axios.post(BASE_URL + path, body, {
      headers: {
        client_id: CLIENT_ID,
        access_token: ACCESS_TOKEN,
        t,
        sign: signStr,
        sign_method: "HMAC-SHA256",
        "Content-Type": "application/json",
      },
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// 🔥 OFF
app.post("/switch/off", async (req, res) => {
  try {
    const t = getTime();
    const path = `/v1.0/devices/${DEVICE_ID}/commands`;

    const body = JSON.stringify({
      commands: [{ code: "switch_1", value: false }],
    });

    const stringToSign = CLIENT_ID + ACCESS_TOKEN + t + buildString("POST", path, body);
    const signStr = sign(SECRET, stringToSign);

    const response = await axios.post(BASE_URL + path, body, {
      headers: {
        client_id: CLIENT_ID,
        access_token: ACCESS_TOKEN,
        t,
        sign: signStr,
        sign_method: "HMAC-SHA256",
        "Content-Type": "application/json",
      },
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});