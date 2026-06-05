# Models Directory

These .onnx files are PLACEHOLDERS. Run scripts/download_models.py to populate them.

## Required Files

| File | Source | Download |
|------|--------|----------|
| scrfd_500m_bnkps.onnx | InsightFace | https://github.com/deepinsight/insightface/releases |
| fasnet_v1.onnx | Silent-Face | https://github.com/minivision-ai/Silent-Face-Anti-Spoofing |
| fasnet_v2.onnx | Silent-Face | same repo |
| mobilefacenet_int8.onnx | Generated | run scripts/quantize_int8.py on base MobileFaceNet |

## After downloading
Copy all 4 .onnx files to:
- android/app/src/main/assets/models/
- ios/OfflineID/models/

Total bundle: ~9.9 MB
