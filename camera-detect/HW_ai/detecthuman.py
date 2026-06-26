import cv2
from ultralytics import YOLO
import requests
import time
import threading
import paho.mqtt.publish as publish

model = YOLO('yolov8n.pt')

RTSP_URL = "rtsp://AiCam504_01:Hw_504_cam01@192.168.88.95:554/stream2"
API_BASE_URL = "https://hw-light-control.onrender.com"

# MQTT_BROKER = "192.168.88.253"
# MQTT_PORT = 1883
# MQTT_USER = "power_node"
# MQTT_PASS = "Hw#504_power"
# MQTT_TOPIC = "room504/ac/servo"

cap = cv2.VideoCapture(RTSP_URL)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

last_movement_time = time.time()
SEND_INTERVAL = 1800.0  #30 นาที

def turn_off_all_devices():
    try:
        for sw_num in range(1, 5):
            for sw_chanel in range(1, 3):
                url = f"{API_BASE_URL}/switch/sw{sw_num}/{sw_chanel}/off"
                response = requests.post(url, timeout=3)
                if response.status_code == 200:
                    print(f"Success! Turned off sw{sw_num}/{sw_chanel}")
                else:
                    print(f"Error: {response.status_code} - {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Cannot link API Server: {e}")

    try:
        print("Sending MQTT command to turn off AC...")

        ac_api_url = f"{API_BASE_URL}/api/room504/ac/servo/press"
        
        data_mqtt = {   
                        "action": "CLOSE",
                        "device": "ac_servo",
                        "room": "504"
                    }
        
        response = requests.post(ac_api_url, json=data_mqtt, timeout=3)     

        print("Success! Turned off AC (Servo pressed via MQTT)")
    except Exception as e:
        print(f"Cannot send MQTT command: {e}")

frame_count = 0
current_person_count = 0
annotated_frame = None

while True:
    if not cap.isOpened():
        time.sleep(5)
        cap = cv2.VideoCapture(RTSP_URL)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        continue
    
    ret, frame = cap.read()
    if not ret:
        cap.release()
        time.sleep(2) 
        cap = cv2.VideoCapture(RTSP_URL) 
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        continue

    frame_count += 1

    # 2. Frame Skipping: รัน AI แค่ 1 ครั้ง ทุกๆ 3 เฟรม (ลดภาระเครื่อง)
    if frame_count % 3 == 0:
        results = model.predict(frame, classes=[0], conf=0.4, verbose=False)
        result = results[0]
        current_person_count = len(result.boxes)
        annotated_frame = result.plot()
    elif annotated_frame is None:
        annotated_frame = frame.copy() # เฟรมแรกสุดถ้ายังไม่มีภาพ AI ให้ใช้ภาพต้นฉบับไปก่อน

    cv2.putText(annotated_frame, f'People: {current_person_count}', (10, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    current_time = time.time()

    # 3. เช็คเวลาและสั่งปิดไฟ
    if current_person_count == 0 and (current_time - last_movement_time > SEND_INTERVAL):
        print("No people detected. Sending turn off command...")
        
        # รันฟังก์ชันยิง API ใน Thread ใหม่ กล้องจะได้ไม่ค้าง
        threading.Thread(target=turn_off_all_devices, daemon=True).start()
        
        last_movement_time = current_time # รีเซ็ตเวลาเพื่อไม่ให้ยิง API ซ้ำรัวๆ

    if current_person_count != 0:
        last_movement_time = current_time

    cv2.imshow('Person Detection', annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()