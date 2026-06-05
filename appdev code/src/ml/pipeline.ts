import { Employee, GestureChallenge } from "../types";
import { getEmployees, decryptFaceprint, getOrCreateSecureKey } from "../database/db";
import { cosineSimilarity } from "../utils/cosineSimilarity";

export interface AIModelStatus {
  loaded: boolean;
  scrfdLoaded: boolean;
  fasnetv1Loaded: boolean;
  fasnetv2Loaded: boolean;
  mobilefacenetLoaded: boolean;
}

// Simulated latency parameters (to mimic SnapDragon runtime bench)
export const MODEL_METADATA = {
  scrfd: { name: "scrfd_500m_bnkps.onnx", purpose: "Face detection", size: "1.2 MB", latency: "45ms" },
  fasnet_v1: { name: "fasnet_v1.onnx", purpose: "Passive anti-spoof", size: "2.4 MB", latency: "70ms" },
  fasnet_v2: { name: "fasnet_v2.onnx", purpose: "Passive anti-spoof pass 2", size: "3.1 MB", latency: "95ms" },
  mobilefacenet: { name: "mobilefacenet_int8.onnx", purpose: "Face recognition", size: "4.8 MB", latency: "120ms" }
};

/**
 * Calculates final passive liveness score based on formula:
 * final = (0.4 * v1_score) + (0.6 * v2_score)
 * Threshold = 0.6 (Reject if below)
 */
export function calculateLiveness(v1Score: number, v2Score: number): { score: number; passed: boolean } {
  const score = (0.4 * v1Score) + (0.6 * v2Score);
  return {
    score,
    passed: score >= 0.6
  };
}

/**
 * Simulates running face detection & identification.
 * Compares an generated embedding with the current database to find a match.
 */
export interface RecognitionResult {
  livenessPassed: boolean;
  livenessScore: number;
  matchedEmployee: Employee | null;
  confidence: number; // cosine similarity
  message: string;
}

export function simulateRecognition(
  inputImgBase64: string, 
  requiredGesture: GestureChallenge, 
  gestureCompleted: boolean,
  forceStatus?: "match" | "no_match" | "spoof" | "gesture_fail",
  simulatedSubjectId?: string
): RecognitionResult {
  
  // 1. Gesture Challenge validation (e.g. blink, smile etc.)
  if (forceStatus === "gesture_fail" || !gestureCompleted) {
    return {
      livenessPassed: true,
      livenessScore: 0.85,
      matchedEmployee: null,
      confidence: 0,
      message: `Gesture Challenge (${requiredGesture}) verification timed out or incorrect.`
    };
  }

  // 2. Anti-spoof validation
  const v1 = forceStatus === "spoof" ? 0.35 : Math.random() * 0.2 + 0.75; // above threshold
  const v2 = forceStatus === "spoof" ? 0.45 : Math.random() * 0.18 + 0.8;
  const liveness = calculateLiveness(v1, v2);

  if (!liveness.passed) {
    return {
      livenessPassed: false,
      livenessScore: liveness.score,
      matchedEmployee: null,
      confidence: 0,
      message: `Anti-spoof check failed: Weighted liveness score ${liveness.score.toFixed(2)} represents a passive print/video threat.`
    };
  }

  // 3. Identification (Real Cosine Similarity Search)
  const employees = getEmployees();
  if (employees.length === 0 || forceStatus === "no_match") {
    return {
      livenessPassed: true,
      livenessScore: liveness.score,
      matchedEmployee: null,
      confidence: 0.42,
      message: "Face was clean and live, but no corresponding match exists in local storage."
    };
  }

  // Generate captured embedding based on simulated subject faceprint
  let capturedEmbedding = new Float32Array(512);
  const key = getOrCreateSecureKey();

  const subjectId = simulatedSubjectId || employees[0].id;
  const subject = employees.find(e => e.id === subjectId) || employees[0];

  if (subject && subject.faceprint) {
    const dec = decryptFaceprint(subject.faceprint, key);
    // Add tiny random noise to simulate camera/capture variance
    capturedEmbedding = new Float32Array(512).map((_, i) => {
      const noise = (Math.random() - 0.5) * 0.04;
      return dec[i] + noise;
    });
  } else {
    capturedEmbedding = handleFiveFrameAveraging();
  }

  // Search local storage
  let bestMatch: Employee | null = null;
  let highestSimilarity = 0;

  for (const emp of employees) {
    if (!emp.faceprint) continue;
    const empEmbedding = decryptFaceprint(emp.faceprint, key);
    const sim = cosineSimilarity(capturedEmbedding, empEmbedding);
    if (sim > highestSimilarity) {
      highestSimilarity = sim;
      bestMatch = emp;
    }
  }

  // If forceStatus is "match", force similarity high
  if (forceStatus === "match" && bestMatch) {
    highestSimilarity = Math.max(highestSimilarity, Math.random() * 0.05 + 0.92);
  }

  if (highestSimilarity > 0.65 && bestMatch) {
    return {
      livenessPassed: true,
      livenessScore: liveness.score,
      matchedEmployee: bestMatch,
      confidence: highestSimilarity,
      message: `Access verified. Match found: ${bestMatch.name} (Code: ${bestMatch.employee_code}) with similarity metric ${highestSimilarity.toFixed(3)}.`
    };
  } else {
    return {
      livenessPassed: true,
      livenessScore: liveness.score,
      matchedEmployee: null,
      confidence: highestSimilarity,
      message: `Faceprint match too low (${highestSimilarity.toFixed(3)}). Unrecognised personnel.`
    };
  }
}
export function handleFiveFrameAveraging(): Float32Array {
  // Return simulated robust element-wise averaged array
  const averaged = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    let sum = 0;
    for (let f = 0; f < 5; f++) {
      sum += Math.random();
    }
    averaged[i] = sum / 5;
  }
  // L2-Normalise the result
  let norm = 0;
  for (let i = 0; i < 512; i++) {
    norm += averaged[i] * averaged[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < 512; i++) {
    averaged[i] = averaged[i] / norm;
  }
  return averaged;
}
