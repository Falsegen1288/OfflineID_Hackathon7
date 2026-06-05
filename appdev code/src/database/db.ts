import { Employee, AttendanceLog, SyncQueueEntry } from "../types";

// Simulated Secure Keystore (Keychain / keystore)
const KEYCHAIN_KEY = "offlineid_aes_key";

export function getOrCreateSecureKey(): string {
  let key = localStorage.getItem(KEYCHAIN_KEY);
  if (!key) {
    // Generate simulated 256-bit key
    const array = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(KEYCHAIN_KEY, hex);
    key = hex;
  }
  return key;
}

// Simulated AES-256-GCM Encryption / Decryption
export function encryptFaceprint(faceprint: Float32Array, key: string): string {
  // Serialize array
  const numbers = Array.from(faceprint);
  const serialized = JSON.stringify(numbers);
  
  // Encrypt with a secure XOR GCM simulation using our key
  let encrypted = "";
  for (let i = 0; i < serialized.length; i++) {
    const charCode = serialized.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    encrypted += String.fromCharCode(charCode ^ keyChar);
  }
  return btoa(unescape(encodeURIComponent(encrypted)));
}

export function decryptFaceprint(encryptedBase64: string, key: string): Float32Array {
  try {
    const encrypted = decodeURIComponent(escape(atob(encryptedBase64)));
    let decrypted = "";
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      decrypted += String.fromCharCode(charCode ^ keyChar);
    }
    const numbers = JSON.parse(decrypted) as number[];
    return new Float32Array(numbers);
  } catch (error) {
    console.error("Failed to decrypt faceprint, returning fallback array", error);
    // Return mock 512 array
    return new Float32Array(512);
  }
}

// Seed Initial Mock Database Data
export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: "emp-01",
    name: "Marcus Chen",
    employee_code: "EMP-482019",
    faceprint: "", // populated at runtime programmatically
    registered_at: Date.now() - 3600000 * 20,
    registered_by: "Admin",
    department: "Logistics & Supply",
    designation: "Fleet Coordinator",
    email: "m.chen@datalake.org",
    phone: "+91 98765 43210"
  },
  {
    id: "emp-02",
    name: "Sarah Jenkins",
    employee_code: "EMP-482015",
    faceprint: "",
    registered_at: Date.now() - 3600000 * 18,
    registered_by: "Admin",
    department: "Field Security",
    designation: "Security Supervisor",
    email: "s.jenkins@datalake.org",
    phone: "+91 98765 43211"
  },
  {
    id: "emp-03",
    name: "David Wilson",
    employee_code: "EMP-481992",
    faceprint: "",
    registered_at: Date.now() - 3600000 * 15,
    registered_by: "Admin",
    department: "Engineering & IT",
    designation: "Systems Engineer",
    email: "d.wilson@datalake.org",
    phone: "+91 98765 43212"
  },
  {
    id: "emp-04",
    name: "Elena Rodriguez",
    employee_code: "EMP-482031",
    faceprint: "",
    registered_at: Date.now() - 3600000 * 12,
    registered_by: "Admin",
    department: "Operations Control",
    designation: "Duty Manager",
    email: "e.rodriguez@datalake.org",
    phone: "+91 98765 43213"
  },
  {
    id: "emp-05",
    name: "Robert Miller",
    employee_code: "EMP-481855",
    faceprint: "",
    registered_at: Date.now() - 3600000 * 48,
    registered_by: "Admin",
    department: "Field Security",
    designation: "Patrol Officer",
    email: "r.miller@datalake.org",
    phone: "+91 98765 43214"
  }
];

export const INITIAL_LOGS: AttendanceLog[] = [
  {
    id: "log-1",
    employee_id: "emp-01",
    employee_name: "Marcus Chen",
    employee_code: "EMP-482019",
    timestamp: Date.now() - 3600000 * 3,
    confidence: 0.984,
    gesture_used: "Blink",
    synced: 0,
    purged: 0
  },
  {
    id: "log-2",
    employee_id: "emp-02",
    employee_name: "Sarah Jenkins",
    employee_code: "EMP-482015",
    timestamp: Date.now() - 3600000 * 4,
    confidence: 0.991,
    gesture_used: "Smile",
    synced: 1,
    purged: 0
  },
  {
    id: "log-3",
    employee_id: "emp-03",
    employee_name: "David Wilson",
    employee_code: "EMP-481992",
    timestamp: Date.now() - 3600000 * 5,
    confidence: 0.978,
    gesture_used: "Blink",
    synced: 1,
    purged: 0
  },
  {
    id: "log-4",
    employee_id: "emp-04",
    employee_name: "Elena Rodriguez",
    employee_code: "EMP-482031",
    timestamp: Date.now() - 3600000 * 6,
    confidence: 0.952,
    gesture_used: "Head Turn",
    synced: 0,
    purged: 0
  },
  {
    id: "log-5",
    employee_id: "emp-05",
    employee_name: "Robert Miller",
    employee_code: "EMP-481855",
    timestamp: Date.now() - 3600000 * 25,
    confidence: 0.998,
    gesture_used: "Blink",
    synced: 1,
    purged: 0
  }
];

// Helper to seed localStorage databases
export function initializeStorage() {
  const secretKey = getOrCreateSecureKey();
  
  if (!localStorage.getItem("offlineid_employees")) {
    // Generate secure randomized mock Float32Array faceprints
    const seededEmployees = INITIAL_EMPLOYEES.map((emp, idx) => {
      const faceprint = new Float32Array(512).map(() => Math.random() * 0.1 + (idx * 0.05));
      return {
        ...emp,
        faceprint: encryptFaceprint(faceprint, secretKey)
      };
    });
    localStorage.setItem("offlineid_employees", JSON.stringify(seededEmployees));
  }

  if (!localStorage.getItem("offlineid_attendance_logs")) {
    localStorage.setItem("offlineid_attendance_logs", JSON.stringify(INITIAL_LOGS));
  }

  if (!localStorage.getItem("offlineid_sync_queue")) {
    localStorage.setItem("offlineid_sync_queue", JSON.stringify([]));
  }
}

export function getEmployees(): Employee[] {
  initializeStorage();
  const raw = localStorage.getItem("offlineid_employees");
  return raw ? JSON.parse(raw) : [];
}

export function saveEmployee(employee: Employee) {
  const employees = getEmployees();
  employees.push(employee);
  localStorage.setItem("offlineid_employees", JSON.stringify(employees));
}

export function getAttendanceLogs(): AttendanceLog[] {
  initializeStorage();
  const raw = localStorage.getItem("offlineid_attendance_logs");
  const parsed = raw ? (JSON.parse(raw) as AttendanceLog[]) : [];
  // Sort logs: descending by timestamp
  return parsed.sort((a,b) => b.timestamp - a.timestamp);
}

export function saveAttendanceLog(log: AttendanceLog) {
  const logs = getAttendanceLogs();
  logs.unshift(log); // newest first
  localStorage.setItem("offlineid_attendance_logs", JSON.stringify(logs));
}

export function updateAttendanceLogSyncStatus(logIds: string[], synced: number, purged: number) {
  const logs = getAttendanceLogs();
  const updated = logs.map(l => {
    if (logIds.includes(l.id)) {
      return { ...l, synced, purged };
    }
    return l;
  });
  localStorage.setItem("offlineid_attendance_logs", JSON.stringify(updated));
}

export function purgeOldLogs() {
  const logs = getAttendanceLogs();
  const oneDayAgo = Date.now() - (24 * 3600 * 1000);
  const beforePurgeCount = logs.length;
  // Keep logs that are NOT purged, or are purged but younger than 24 hours
  const filtered = logs.filter(l => {
    if (l.purged === 1 && l.timestamp < oneDayAgo) {
      return false; // Hard delete
    }
    return true;
  });
  localStorage.setItem("offlineid_attendance_logs", JSON.stringify(filtered));
  return beforePurgeCount - filtered.length;
}

export function getSyncQueue(): SyncQueueEntry[] {
  initializeStorage();
  const raw = localStorage.getItem("offlineid_sync_queue");
  return raw ? JSON.parse(raw) : [];
}

export function addToSyncQueue(entry: SyncQueueEntry) {
  const queue = getSyncQueue();
  queue.push(entry);
  localStorage.setItem("offlineid_sync_queue", JSON.stringify(queue));
}

export function updateSyncQueueEntryAttempts(entryId: string, attempts: number) {
  const queue = getSyncQueue();
  const updated = queue.map(q => q.id === entryId ? { ...q, attempts } : q);
  localStorage.setItem("offlineid_sync_queue", JSON.stringify(updated));
}

export function removeFromSyncQueue(entryId: string) {
  const queue = getSyncQueue();
  const filtered = queue.filter(q => q.id !== entryId);
  localStorage.setItem("offlineid_sync_queue", JSON.stringify(filtered));
}
