# SAMS API Specification

## 1. FastAPI AI Microservice Endpoints (`apps/ai-service`)

### 1.1 Health & Diagnostics
* **`GET /health`** / **`GET /api/v1/health`**
  * **Auth**: None (public health ping)
  * **Response**:
    ```json
    {
      "status": "healthy",
      "service": "sams-ai-service",
      "version": "1.0.0",
      "environment": "development",
      "calibration": {
        "match_threshold": 0.65,
        "review_threshold": 0.45,
        "detection_confidence": 0.80
      },
      "capabilities": {
        "or_tools_enabled": true,
        "vision_enabled": true
      }
    }
    ```

### 1.2 Timetable Optimization Engine
* **`POST /api/v1/timetable/optimize`**
  * **Headers**: `X-Internal-API-Key: <key>`
  * **Payload**:
    ```json
    {
      "config": {
        "working_days": [1, 2, 3, 4, 5],
        "periods_per_day": 7,
        "max_solver_seconds": 30
      },
      "section_id": "uuid",
      "subjects": [...],
      "faculty_list": [...],
      "rooms": [...],
      "unavailabilities": [...]
    }
    ```
  * **Response**:
    ```json
    {
      "status": "OPTIMAL",
      "solve_time_seconds": 1.42,
      "conflicts_count": 0,
      "schedule_entries": [
        {
          "day": 1,
          "period": 1,
          "subject_id": "uuid",
          "faculty_id": "uuid",
          "room_id": "uuid"
        }
      ]
    }
    ```

### 1.3 Biometrics & Face Recognition
* **`POST /api/v1/face/enroll`**
  * **Headers**: `X-Internal-API-Key: <key>`
  * **Payload**: Multipart Form (`file: image/jpeg`, `student_id: uuid`)
  * **Response**:
    ```json
    {
      "success": true,
      "student_id": "uuid",
      "embedding": [0.043, -0.129, ...],
      "dimension": 512,
      "quality_score": 0.94
    }
    ```

* **`POST /api/v1/face/verify-frame`**
  * **Headers**: `X-Internal-API-Key: <key>`
  * **Payload**:
    ```json
    {
      "session_id": "uuid",
      "frame_base64": "data:image/jpeg;base64,...",
      "enrolled_faces": [
        { "student_id": "uuid", "embedding": [...] }
      ],
      "already_marked_ids": ["uuid"]
    }
    ```
  * **Response**:
    ```json
    {
      "faces_detected": 1,
      "matches": [
        {
          "student_id": "uuid",
          "similarity": 0.82,
          "decision": "PRESENT",
          "box": [120, 80, 260, 220]
        }
      ]
    }
    ```

---

## 2. Next.js Web Internal API Handlers (`apps/web/src/app/api`)

* **`GET /api/health`**
  * Application health check, checks Next.js runtime status and verifies downstream AI service connectivity.
