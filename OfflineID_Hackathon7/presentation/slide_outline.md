# Hackathon 7.0 — Slide Outline

## Slide 1: Title
OfflineID — Secure Offline Facial Recognition for Field Personnel
Team name, date

## Slide 2: Problem Understanding
- Field personnel in zero-network zones
- Attendance fraud via photos/screens
- Existing Datalake 3.0 integration requirement

## Slide 3: Solution Overview
4-stage pipeline diagram:
SCRFD → FASNet (passive) → ML Kit Gesture (active) → MobileFaceNet

## Slide 4: Model Choices & Why
Table: Model | Size | Accuracy | License | Why Chosen

## Slide 5: Compression Strategy
FP32 → INT8 PTQ: size and accuracy numbers
Graph optimization techniques

## Slide 6: Liveness Detection — Dual Layer
Passive: FASNet anti-spoof diagram
Active: Blink/Smile/Turn gesture detection with EAR formula

## Slide 7: App Architecture
Layer diagram (UI → TypeScript → Native Bridge → ONNX Runtime → SQLCipher)

## Slide 8: Registration Flow (screenshots/mockup)
Step-by-step with UI mockups

## Slide 9: Attendance Flow (screenshots/mockup)
Step-by-step with UI mockups

## Slide 10: Security Design
AES-256-GCM, Android Keystore, no raw images stored, presigned S3 URLs

## Slide 11: Sync & Purge Mechanism
Offline queue → network restore → S3 upload → purge flow

## Slide 12: Performance Benchmarks
Latency breakdown table + accuracy numbers on LFW

## Slide 13: Open Source Compliance
All MIT/Apache 2.0 — full license table

## Slide 14: Future Roadmap
Fine-tune on Indian demographics dataset, on-device training for new employees
