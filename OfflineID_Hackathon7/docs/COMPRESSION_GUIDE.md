# Model Compression Guide

## Step-by-step (run scripts/ on your laptop or Google Colab)

### 1. Download base models
```bash
python scripts/download_models.py
```
Downloads from InsightFace HuggingFace and Silent-Face GitHub releases.
Saves FP32 ONNX files to models/raw/

### 2. Convert to ONNX (if PyTorch .pth weights)
```bash
python scripts/convert_to_onnx.py --model mobilefacenet
```

### 3. INT8 Post-Training Quantization
```bash
python scripts/quantize_int8.py --model models/raw/mobilefacenet.onnx
```
Uses onnxruntime.quantization.quantize_dynamic() with QInt8 weight type.
Output: models/mobilefacenet_int8.onnx

### 4. Graph optimization
Applied inside quantize_int8.py using:
  sess_options.graph_optimization_level = GraphOptimizationLevel.ORT_ENABLE_ALL

### 5. Validate accuracy
```bash
python scripts/validate_accuracy.py --model models/mobilefacenet_int8.onnx
```
Runs on LFW pairs — must stay above 98.5%

### 6. Benchmark latency
```bash
python scripts/benchmark_model.py --model models/mobilefacenet_int8.onnx --runs 100
```

## Techniques Summary

| Technique | Applied To | Size Impact | Accuracy Impact |
|-----------|-----------|-------------|-----------------|
| INT8 PTQ  | MobileFaceNet | -63% | -0.21% |
| INT8 PTQ  | SCRFD-500M | -58% | -0.15% |
| Graph opt | All models | -5-10% | 0% |
| Fixed shapes | All models | minor | 0% |

## NOT used (and why)
- Pruning: would require retraining, too time-intensive
- Knowledge Distillation: good for custom dataset, out of scope here
- Binary quantization: too much accuracy loss for face recognition
