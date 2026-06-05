export enum AccessRole {
  EMPLOYEE = "employee",
  ADMIN = "admin"
}

export interface Employee {
  id: string; // UUID
  name: string;
  employee_code: string;
  faceprint: string; // Base64 of encrypted 512-float array
  registered_at: number; // Unix ms
  registered_by: string;
  department?: string;
  designation?: string;
  email?: string;
  phone?: string;
}


export interface AttendanceLog {
  id: string; // UUID
  employee_id: string;
  employee_name: string; // helper for local display
  employee_code: string; // helper for local display
  timestamp: number; // Unix ms
  confidence: number; // 0-1
  gesture_used: string; // "Blink", "Smile", "Head Turn"
  synced: number; // 0 or 1
  purged: number; // 0 or 1
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
