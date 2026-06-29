import cv2
from ultralytics import YOLO
import requests
import time
import threading

model = YOLO('yolov8n.pt')

RTSP_URL = "rtsp://AiCam504_01:Hw_504_cam01@192.168.88.222:554/stream2"
API_BASE_URL = "https://hw-light-control.onrender.com"

# บังคับใช้ TCP เพื่อลดปัญหาภาพหล่นหาย (Packet Loss) ระหว่างทาง
import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

last_movement_time = time.time()
SEND_INTERVAL = 1800.0  # 30 นาที

def turn_off_all_devices():
    try:
        for sw_num in range(1, 5):
            # แก้ไขการอ่านค่า Response ให้ถูกต้อง
            response_status = requests.get(f"{API_BASE_URL}/switch/sw{sw_num}/state")
            
            if response_status.status_code == 200:
                switch_status = response_status.json()
                
                # เช็กค่าจาก Dictionary ที่แปลงมาจาก JSON
                if switch_status.get('switch_1') == True:
                    url = f"{API_BASE_URL}/switch/sw{sw_num}/{1}/off"
                    requests.post(url, timeout=3)
                
                if switch_status.get('switch_2') == True:
                    url = f"{API_BASE_URL}/switch/sw{sw_num}/{2}/off"
                    res = requests.post(url, timeout=3)
                    if res.status_code == 200:
                        print(f"Success! Turned off sw{sw_num}")
                    else:
                        print(f"Error: {res.status_code} - {res.text}")
            else:
                print(f"Error reading state sw{sw_num}: {response_status.status_code}")
                
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
        requests.post(ac_api_url, json=data_mqtt, timeout=3)    
        print("Success! Turned off AC (Servo pressed via MQTT)")
    except Exception as e:
        print(f"Cannot send MQTT command: {e}")

current_person_count = 0
annotated_frame = None

# ตัวแปรจับเวลาสำหรับรัน AI 1 ครั้งต่อ 1 วินาที
last_analyze_time = time.time()

while True:
    if not cap.isOpened():
        print("Camera not opened. Retrying...")
        time.sleep(5)
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        continue
    
    # 1. Grab(): สูบภาพทิ้งอย่างรวดเร็วเพื่อไม่ให้ Buffer ล้น (ไม่ใช้ CPU ถอดรหัสภาพ)
    ret = cap.grab()
    if not ret:
        print("Stream lost. Reconnecting...")
        cap.release()
        time.sleep(2) 
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG) 
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        continue

    current_time = time.time()

    # 2. เช็กเวลา ถ้าครบ 1 วินาที ค่อย Retrieve() ภาพมาถอดรหัสและรัน YOLO
    if current_time - last_analyze_time >= 1.0:
        ret_retrieve, frame = cap.retrieve()
        
        if ret_retrieve:
            results = model.predict(frame, classes=[0], conf=0.15, verbose=False)
            result = results[0]
            current_person_count = len(result.boxes)
            annotated_frame = result.plot()
            
            # อัปเดตเวลาที่รัน AI ล่าสุด
            last_analyze_time = current_time
            
            # ถ้ามีคนอยู่ ให้รีเซ็ตเวลา
            if current_person_count != 0:
                last_movement_time = current_time
        
    elif annotated_frame is None:
        # ดึงภาพแรกสุดมาโชว์ก่อน AI ทำงาน
        ret_retrieve, frame = cap.retrieve()
        if ret_retrieve:
            annotated_frame = frame.copy() 

    # 3. เช็กเวลาเพื่อปิดอุปกรณ์ (30 นาที)
    if current_person_count == 0 and (current_time - last_movement_time > SEND_INTERVAL):
        print("No people detected. Sending turn off command...")
        threading.Thread(target=turn_off_all_devices, daemon=True).start()
        last_movement_time = current_time # รีเซ็ตกันยิงซ้ำ

    # วาดตัวหนังสือและแสดงผล
    if annotated_frame is not None:
        cv2.putText(annotated_frame, f'People: {current_person_count}', (10, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.imshow('Person Detection', annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()