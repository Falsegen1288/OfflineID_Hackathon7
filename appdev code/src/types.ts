export enum AccessRole {
  EMPLOYEE = "employee",
  ADMIN = "admin"
}

export interface FaceEmbedding {
  vector: number[];          // 512-dim L2-normalized float array
  gestureId: string;         // which gesture produced this frame
  capturedAt: number;        // unix timestamp
}

export interface Employee {
  id: string; // UUID
  name: string;
  employee_code: string;
  faceprint: string; // Base64 of encrypted 512-float array (legacy compatibility)
  registered_at: number; // Unix ms
  registered_by: string;
  department?: string;
  designation?: string;
  email?: string;
  phone?: string;
  avatarDataUrl?: string;    // base64 JPEG of captured face (thumbnail)

  // Biometrics
  embeddings?: FaceEmbedding[];    // one embedding per gesture (5 total)
  masterEmbedding?: number[];      // averaged + L2-normalized across all 5 frames

  // Audit
  lastLoginAt?: number;
  loginCount?: number;
}

export interface AttendanceLog {
  id: string; // UUID
  employee_id: string;
  employee_name: string; // helper for local display
  employee_code: string; // helper for local display
  timestamp: number; // Unix ms
  confidence: number; // 0-1 (matches similarity score)
  gesture_used: string; // "Blink", "Smile", "Head Turn", etc.
  synced: number; // 0 or 1
  purged: number; // 0 or 1
  gesturesPassed?: string[];
  type?: 'IN' | 'OUT';
}

export interface SyncQueueEntry {
  id: string;
  payload: string; // JSON string
  attempts: number;
  created_at: number;
}

export enum GestureChallenge {
  BLINK = "BLINK",
  SMILE = "SMILE",
  TURN_LEFT = "TURN_LEFT",
  TURN_RIGHT = "TURN_RIGHT"
}

export interface AppState {
  currentRole: AccessRole;
  isLoggedIn: boolean;
  currentUser: string | null;
  networkStatus: "online" | "offline";
  systemLogs: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warning" | "error" | "success";
  message: string;
}
