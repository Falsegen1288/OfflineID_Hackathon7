# System Architecture

## High-Level Layers

```
┌─────────────────────────────────────────────────────────┐
│                   React Native UI Layer                  │
│  Screens · Components · Navigation · Context · Hooks    │
├─────────────────────────────────────────────────────────┤
│                  TypeScript ML Layer                     │
│  FaceDetector · LivenessChecker · FaceRecognizer        │
│  GestureChallenge · ModelLoader                         │
├─────────────────────────────────────────────────────────┤
│               Native Bridge (NativeModule)               │
│    Android: OnnxModule.kt · FaceInferenceEngine.kt      │
│    iOS:     OnnxBridge.swift · FaceInferenceEngine.swift│
├─────────────────────────────────────────────────────────┤
│                ONNX Runtime (on-device)                  │
│    scrfd_500m · fasnet_v1 · fasnet_v2 · mobilefacenet   │
├─────────────────────────────────────────────────────────┤
│               Security + Storage Layer                   │
│    SQLCipher DB · AES-256-GCM · Android Keystore /      │
│    iOS Secure Enclave                                    │
├─────────────────────────────────────────────────────────┤
│               Sync Layer (when online)                   │
│    NetworkMonitor · SyncManager · S3Uploader            │
│    Presigned URL → AWS S3 → Purge                       │
└─────────────────────────────────────────────────────────┘
```

## Data Flow: Registration

Admin → RegisterFaceScreen
  → CameraView opens (front camera)
  → Capture 5 frames (user moves face slightly each time)
  → Each frame: SCRFD detect → ArcFace align → MobileFaceNet embed
  → Average 5 embeddings → single 512-d faceprint
  → Encrypt with AES-256-GCM
  → Store in employees table (SQLCipher)
  → Show confirmation

## Data Flow: Attendance

Employee → AttendanceScreen
  → CameraView opens (front camera, continuous frames)
  → SCRFD: detect face → extract landmarks
  → FASNet (passive): anti-spoof score
  → If score < 0.6: reject with message
  → GestureChallenge: random prompt + timer
  → ML Kit: monitor gesture completion
  → If gesture failed: reject
  → MobileFaceNet: extract embedding
  → CosineSimilarity: match vs all enrolled
  → If best_sim > 0.65: mark attendance
  → SQLite write → SyncManager triggered

## Data Flow: Sync

SyncManager (triggered on network change or manual)
  → Query syncQueue WHERE synced=0
  → POST /generate-presigned-url to backend
  → PUT attendance batch JSON to S3 presigned URL
  → On success: UPDATE attendance SET synced=1, purged=1
  → DELETE purged rows after 24h grace period
