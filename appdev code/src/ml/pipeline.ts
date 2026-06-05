import { Employee, GestureChallenge, FaceEmbedding } from "../types";
import { getEmployees, getEmployeesAsync, decryptFaceprint, getOrCreateSecureKey } from "../database/db";
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

export function extractPixelEmbedding(
  canvas: HTMLCanvasElement,
  dims = 512
): number[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Array(dims).fill(0);
  
  // Focus on center 60% of frame (face region)
  const cx = canvas.width * 0.2, cy = canvas.height * 0.15;
  const cw = canvas.width * 0.6, ch = canvas.height * 0.7;
  const data = ctx.getImageData(
    Math.max(0, Math.floor(cx)), 
    Math.max(0, Math.floor(cy)), 
    Math.min(canvas.width, Math.floor(cw)), 
    Math.min(canvas.height, Math.floor(ch))
  ).data;

  const bucketSize = Math.floor(data.length / (dims * 4));
  const embedding = new Array(dims);

  for (let i = 0; i < dims; i++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < bucketSize; j++) {
      const idx = (i * bucketSize + j) * 4;
      if (idx + 2 < data.length) {
        r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
      }
    }
    // Luminance-weighted average
    embedding[i] = (0.299 * r + 0.587 * g + 0.114 * b) / (Math.max(1, bucketSize) * 255);
  }

  return l2Normalize(embedding);
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) + 1e-10;
  return v.map(x => x / norm);
}

export async function matchEmployeeAsync(
  queryEmbeddings: number[][],       // 5 gesture embeddings from login
  requiredGesture: GestureChallenge,
  gestureCompleted: boolean,
  forceStatus?: "match" | "no_match" | "spoof" | "gesture_fail",
  simulatedSubjectId?: string,
  threshold = 0.65
): Promise<RecognitionResult> {
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

  // 3. Compute master query embedding
  const sumVec = new Array(queryEmbeddings[0].length).fill(0);
  for (const e of queryEmbeddings) {
    e.forEach((v, i) => { sumVec[i] += v; });
  }
  const queryMaster = l2Normalize(sumVec.map(v => v / queryEmbeddings.length));

  // 4. Load all employees asynchronously
  const employees = await getEmployeesAsync();
  if (employees.length === 0 || forceStatus === "no_match") {
    return {
      livenessPassed: true,
      livenessScore: liveness.score,
      matchedEmployee: null,
      confidence: 0.42,
      message: "Face was clean and live, but no corresponding match exists in local storage."
    };
  }

  // 5. Compute similarities
  let bestMatch: Employee | null = null;
  let highestSimilarity = 0;

  for (const emp of employees) {
    const empEmbedding = emp.masterEmbedding;
    if (!empEmbedding) continue;

    // Compute cosine similarity between queryMaster and emp.masterEmbedding
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < queryMaster.length; i++) {
      dot   += queryMaster[i] * empEmbedding[i];
      normA += queryMaster[i] * queryMaster[i];
      normB += empEmbedding[i] * empEmbedding[i];
    }
    const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);

    if (sim > highestSimilarity) {
      highestSimilarity = sim;
      bestMatch = emp;
    }
  }

  // Handle simulated / forced outcomes for testing
  if (forceStatus === "match" && simulatedSubjectId) {
    const forcedEmp = employees.find(e => e.id === simulatedSubjectId);
    if (forcedEmp) {
      bestMatch = forcedEmp;
      highestSimilarity = Math.max(highestSimilarity, Math.random() * 0.05 + 0.92);
    }
  }

  if (highestSimilarity >= threshold && bestMatch) {
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

export function simulateRecognition(
  inputImgBase64: string, 
  requiredGesture: GestureChallenge, 
  gestureCompleted: boolean,
  forceStatus?: "match" | "no_match" | "spoof" | "gesture_fail",
  simulatedSubjectId?: string
): RecognitionResult {
  if (forceStatus === "gesture_fail" || !gestureCompleted) {
    return {
      livenessPassed: true,
      livenessScore: 0.85,
      matchedEmployee: null,
      confidence: 0,
      message: `Gesture Challenge (${requiredGesture}) verification timed out or incorrect.`
    };
  }

  const v1 = forceStatus === "spoof" ? 0.35 : Math.random() * 0.2 + 0.75;
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

  let capturedEmbedding = new Float32Array(512);
  const key = getOrCreateSecureKey();

  const subjectId = simulatedSubjectId || employees[0].id;
  const subject = employees.find(e => e.id === subjectId) || employees[0];

  if (subject && subject.faceprint) {
    const dec = decryptFaceprint(subject.faceprint, key);
    capturedEmbedding = new Float32Array(512).map((_, i) => {
      const noise = (Math.random() - 0.5) * 0.04;
      return dec[i] + noise;
    });
  } else {
    capturedEmbedding = handleFiveFrameAveraging();
  }

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
  const averaged = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    let sum = 0;
    for (let f = 0; f < 5; f++) {
      sum += Math.random();
    }
    averaged[i] = sum / 5;
  }
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
