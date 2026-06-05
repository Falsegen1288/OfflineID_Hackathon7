# Model Pipeline — Technical Details

## Stage 1: Face Detection — SCRFD-500M

Input:  BGR image, any resolution
Output: face_boxes [N x 4], landmarks [N x 5 x 2], scores [N]

SCRFD (Sample Counting Regression-based Face Detection) is InsightFace's
mobile-optimized detector. The 500M variant uses MobileNetV2 backbone with
~500M FLOPs. It outperforms RetinaFace-MobileNet at half the compute.

Preprocessing: resize to 640x640, subtract [127.5, 127.5, 127.5], divide by 128

## Stage 2: Passive Anti-Spoof — FASNet (Silent-Face)

Input:  112x112 aligned face crop (from SCRFD landmarks)
Output: liveness_score float [0.0 = spoof, 1.0 = live]

Two models run in parallel:
- fasnet_v1: trained on CASIA-FASD, Replay-Attack, MSU-MFSD
- fasnet_v2: larger context window, better on screen replay attacks
Final score = 0.4 * v1 + 0.6 * v2 (v2 weighted higher)
Threshold: 0.6 (tunable in modelConfig.ts)

## Stage 3: Active Gesture — ML Kit Face Mesh

Challenge randomly selected from: BLINK, SMILE, TURN_LEFT, TURN_RIGHT

Blink detection:
  EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
  EAR < 0.2 for 2 consecutive frames = blink confirmed

Smile detection:
  Lip distance = ||top_lip_center - bottom_lip_center||
  Normalized by inter-ocular distance
  Ratio > 0.15 = smile confirmed

Turn detection:
  Head yaw angle from Face Mesh 3D pose
  |yaw| > 15 degrees sustained for 0.5s = turn confirmed

## Stage 4: Face Recognition — MobileFaceNet + ArcFace

Input:  112x112 BGR face crop, ArcFace-aligned using 5 landmarks
Output: 512-dimensional L2-normalized embedding vector

ArcFace alignment (5-point):
  Source landmarks from SCRFD
  Target template: standard 112x112 5-point template
  Affine transform computed using cv2.estimateAffinePartial2D

INT8 Quantization impact:
  FP32 accuracy LFW: 99.28%
  INT8 accuracy LFW: 99.07%  (delta: -0.21% — acceptable)
  Size: 4.1 MB → 1.5 MB (2.7x reduction)

Matching:
  Enrolled faceprints loaded from SQLCipher DB into memory on app start
  Cosine similarity: sim = dot(a, b) / (||a|| * ||b||)
  Match threshold: 0.65 (tunable)
  Anti-spoofing: if no live face in last 30s, re-run full pipeline

## Model Bundle Sizes (final)

scrfd_500m_bnkps.onnx       1.7 MB
fasnet_v1.onnx               2.7 MB
fasnet_v2.onnx               4.0 MB
mobilefacenet_int8.onnx      1.5 MB
TOTAL                        9.9 MB  (under 20 MB cap)
