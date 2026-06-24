import cv2
from ultralytics import YOLO
import requests
import time

model = YOLO('yolov8n.pt')

RTSP_URL = "rtsp://AiCam504_01:Hw_504_cam01@192.168.88.95:554/stream2"
API_BASE_URL = "https://hw-light-control.onrender.com"

cap = cv2.VideoCapture(RTSP_URL)

BACKEND_URL = "http://localhost:8000/lighttrigger/update-occupancy"

last_movement_time = time.time()
SEND_INTERVAL = 5.0  #30 นาที

while True:
    if not cap.isOpened():
            time.sleep(5)
            cap = cv2.VideoCapture(RTSP_URL)
            continue
    
    ret, frame = cap.read()
    if not ret:
        cap.release()
        time.sleep(2) 
        cap = cv2.VideoCapture(RTSP_URL) 
        continue

    results = model.predict(frame, classes=[0], conf=0.4, verbose=False)
    
    result = results[0]
    
    current_person_count = len(result.boxes)

    annotated_frame = result.plot()
    
    cv2.putText(annotated_frame, f'People: {current_person_count}', (10, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    current_time = time.time()

    if current_person_count == 0 and (current_time - last_movement_time > SEND_INTERVAL):
            try:
                for sw_num in range(1, 5):
                    for sw_chanel in range(1, 3):
                        response = requests.post(f"{API_BASE_URL}/switch/sw{sw_num}/{sw_chanel}/off", timeout=3)
                        
                if response.status_code == 200:
                    print("Success!")
                else:
                    print(f"Error: {response.status_code} - {response.text}")
                    
            except requests.exceptions.RequestException as e:
                print(f"Cannot link API Server: {e}")

            last_movement_time = current_time

    if current_person_count != 0:
        last_movement_time = current_time

    cv2.imshow('Person Detection', annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()