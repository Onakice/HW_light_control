#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Servo.h>

// ==========================================
// 1. ตั้งค่า WiFi (แก้ไขให้ตรงกับเน็ตที่บอร์ดจะต่อ)
// ==========================================
const char* ssid = "HardwarelabWifi_IoT";         // ใส่ชื่อ WiFi ของคุณ
const char* password = "Hwlab#504_IOT"; // ใส่รหัสผ่าน WiFi

// ==========================================
// 2. ตั้งค่า MQTT Broker (ตามที่คุณใช้)
// ==========================================
const char* mqtt_server = "161.246.5.253";
const int mqtt_port = 1883;
const char* mqtt_user = "weather_sensor_node";
const char* mqtt_pass = "Hw#504_wsn";

// Topic ที่จะรอรับคำสั่ง (ต้องตรงกับฝั่ง Node.js ที่ส่งมา)
const char* topic_sub = "room504/ac/servo";

// ==========================================
// 3. ตั้งค่า Servo
// ==========================================
Servo myServo;
const int servoPin = 13; // ขา GPIO2 (เทียบเท่าขา D4 บน NodeMCU/Wemos D1 Mini)

// ** ต้องปรับมุมองศานี้หน้างาน ให้พอดีกับระยะการกดปุ่มแอร์ **
const int ANGLE_IDLE = 0;   // มุมพัก (ยกนิ้วขึ้น)
const int ANGLE_PRESS = 60; // มุมกด (กดนิ้วลงไปที่ปุ่มแอร์)

WiFiClient espClient;
PubSubClient client(espClient);

// ฟังก์ชันเชื่อมต่อ WiFi
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

// ฟังก์ชันทำงานเมื่อมีข้อความ MQTT ส่งเข้ามา
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // เช็กว่าข้อความที่ส่งมาคือคำว่า "PUSH" หรือไม่
  if (message == "PUSH") {
    Serial.println("Action: Pressing AC Button...");
    
    // สั่ง Servo กดปุ่ม
    myServo.write(ANGLE_PRESS);
    delay(500); // ค้างนิ้วไว้ 0.5 วินาที
    
    // สั่ง Servo ชักนิ้วกลับ
    myServo.write(ANGLE_IDLE);
    Serial.println("Action: Done.");
  }
}

// ฟังก์ชันเชื่อมต่อ MQTT ใหม่เมื่อหลุด
void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    // สร้าง Client ID แบบสุ่มป้องกันการชนกัน
    String clientId = "ESP8266Client-";
    clientId += String(random(0xffff), HEX);
    
    // ลองล็อกอินเข้า MQTT Broker
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("connected");
      // เมื่อต่อสำเร็จ ให้ Subscribe รอรับคำสั่งเลย
      client.subscribe(topic_sub);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  // ตั้งค่าขา Servo และกำหนดให้ยกนิ้วขึ้นรอไว้เลย
  myServo.attach(servoPin);
  myServo.write(ANGLE_IDLE);

  setup_wifi();
  
  // ตั้งค่า MQTT Server และกำหนดฟังก์ชันรับข้อความ
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  // รักษาสถานะการเชื่อมต่อ MQTT
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); // ให้ไลบรารีคอยอัปเดตข้อความเข้า-ออก
}