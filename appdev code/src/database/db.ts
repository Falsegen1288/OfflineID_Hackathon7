import { Employee, AttendanceLog, SyncQueueEntry, FaceEmbedding } from "../types";
import { getOrCreateSessionKey, encryptRecord, decryptRecord } from "../utils/crypto";

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

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) + 1e-10;
  return v.map(x => x / norm);
}

// Helper to seed localStorage databases
export async function initializeStorageAsync() {
  const sessionKey = await getOrCreateSessionKey();
  
  if (!localStorage.getItem("offlineid:employees:index")) {
    const index: string[] = [];
    const seededEmployees = INITIAL_EMPLOYEES.map((emp, idx) => {
      // Create simulated embeddings
      const GESTURE_IDS = ['still', 'turn_right', 'turn_left', 'blink', 'smile'];
      const embeddings: FaceEmbedding[] = GESTURE_IDS.map((gid) => {
        const vector = new Array(512).fill(0).map(() => Math.random() * 0.1 + (idx * 0.05));
        return {
          vector: l2Normalize(vector),
          gestureId: gid,
          capturedAt: Date.now()
        };
      });

      const sumVec = new Array(512).fill(0);
      for (const e of embeddings) {
        e.vector.forEach((v, i) => { sumVec[i] += v; });
      }
      const masterEmbedding = l2Normalize(sumVec.map(v => v / embeddings.length));

      return {
        ...emp,
        embeddings,
        masterEmbedding,
        registered_at: Date.now() - 3600000 * (20 - idx),
        loginCount: 0
      };
    });

    for (const emp of seededEmployees) {
      index.push(emp.employee_code);
      const encrypted = await encryptRecord(sessionKey, emp);
      localStorage.setItem(`offlineid:employee:${emp.employee_code}`, encrypted);
    }
    localStorage.setItem("offlineid:employees:index", JSON.stringify(index));
  }

  if (!localStorage.getItem("offlineid_attendance_logs")) {
    localStorage.setItem("offlineid_attendance_logs", JSON.stringify(INITIAL_LOGS));
  }

  if (!localStorage.getItem("offlineid_sync_queue")) {
    localStorage.setItem("offlineid_sync_queue", JSON.stringify([]));
  }
}

export async function getEmployeesAsync(): Promise<Employee[]> {
  await initializeStorageAsync();
  const indexRaw = localStorage.getItem("offlineid:employees:index");
  if (!indexRaw) return [];
  
  const index: string[] = JSON.parse(indexRaw);
  const sessionKey = await getOrCreateSessionKey();
  
  const list: Employee[] = [];
  for (const code of index) {
    const encrypted = localStorage.getItem(`offlineid:employee:${code}`);
    if (!encrypted) continue;
    try {
      const emp = await decryptRecord<Employee>(sessionKey, encrypted);
      list.push(emp);
    } catch (e) {
      console.error(`Failed to decrypt record for ${code}`, e);
    }
  }
  return list;
}

export async function saveEmployeeAsync(employee: Employee): Promise<void> {
  const sessionKey = await getOrCreateSessionKey();
  
  // Encrypt and save
  const encrypted = await encryptRecord(sessionKey, employee);
  localStorage.setItem(`offlineid:employee:${employee.employee_code}`, encrypted);
  
  // Update index
  const indexRaw = localStorage.getItem("offlineid:employees:index");
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  if (!index.includes(employee.employee_code)) {
    index.push(employee.employee_code);
    localStorage.setItem("offlineid:employees:index", JSON.stringify(index));
  }
}

export async function getAttendanceLogsAsync(): Promise<AttendanceLog[]> {
  await initializeStorageAsync();
  const sessionKey = await getOrCreateSessionKey();
  const list: AttendanceLog[] = [];
  
  // Process daily encrypted blocks
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("offlineid:attendance:")) {
      const encrypted = localStorage.getItem(key);
      if (encrypted) {
        try {
          const logs = await decryptRecord<AttendanceLog[]>(sessionKey, encrypted);
          list.push(...logs);
        } catch (e) {
          console.error(`Failed to decrypt attendance log for key ${key}`, e);
        }
      }
    }
  }
  
  // Mix in legacy unencrypted logs if they exist
  const legacyRaw = localStorage.getItem("offlineid_attendance_logs");
  if (legacyRaw) {
    try {
      const legacyLogs = JSON.parse(legacyRaw) as AttendanceLog[];
      list.push(...legacyLogs);
    } catch (e) {
      console.error("Failed to parse legacy attendance logs", e);
    }
  }
  
  // Filter duplicates (by ID) and sort descending by timestamp
  const seenIds = new Set<string>();
  const uniqueList = list.filter(l => {
    if (seenIds.has(l.id)) return false;
    seenIds.add(l.id);
    return true;
  });

  return uniqueList.sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveAttendanceLogAsync(log: AttendanceLog): Promise<void> {
  const sessionKey = await getOrCreateSessionKey();
  const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
  const key = `offlineid:attendance:${dateStr}`;
  
  let list: AttendanceLog[] = [];
  const existing = localStorage.getItem(key);
  if (existing) {
    try {
      list = await decryptRecord<AttendanceLog[]>(sessionKey, existing);
    } catch {
      list = [];
    }
  }
  
  list.unshift(log); // newest first
  const encrypted = await encryptRecord(sessionKey, list);
  localStorage.setItem(key, encrypted);
}

export async function updateAttendanceLogSyncStatusAsync(logIds: string[], synced: number, purged: number): Promise<void> {
  const sessionKey = await getOrCreateSessionKey();
  
  // Update in daily encrypted blocks
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("offlineid:attendance:")) {
      const encrypted = localStorage.getItem(key);
      if (encrypted) {
        try {
          const logs = await decryptRecord<AttendanceLog[]>(sessionKey, encrypted);
          let modified = false;
          const updated = logs.map(l => {
            if (logIds.includes(l.id)) {
              modified = true;
              return { ...l, synced, purged };
            }
            return l;
          });
          if (modified) {
            const nextEncrypted = await encryptRecord(sessionKey, updated);
            localStorage.setItem(key, nextEncrypted);
          }
        } catch (e) {
          console.error(`Failed to update attendance log sync for key ${key}`, e);
        }
      }
    }
  }

  // Update in legacy logs as well
  const legacyRaw = localStorage.getItem("offlineid_attendance_logs");
  if (legacyRaw) {
    try {
      const logs = JSON.parse(legacyRaw) as AttendanceLog[];
      const updated = logs.map(l => logIds.includes(l.id) ? { ...l, synced, purged } : l);
      localStorage.setItem("offlineid_attendance_logs", JSON.stringify(updated));
    } catch {}
  }
}

export async function purgeOldLogsAsync(): Promise<number> {
  const sessionKey = await getOrCreateSessionKey();
  const oneDayAgo = Date.now() - (24 * 3600 * 1000);
  let purgedCount = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("offlineid:attendance:")) {
      const encrypted = localStorage.getItem(key);
      if (encrypted) {
        try {
          const logs = await decryptRecord<AttendanceLog[]>(sessionKey, encrypted);
          const filtered = logs.filter(l => {
            if (l.purged === 1 && l.timestamp < oneDayAgo) {
              purgedCount++;
              return false; // Hard delete
            }
            return true;
          });
          if (filtered.length === 0) {
            localStorage.removeItem(key);
          } else if (filtered.length !== logs.length) {
            const nextEncrypted = await encryptRecord(sessionKey, filtered);
            localStorage.setItem(key, nextEncrypted);
          }
        } catch (e) {
          console.error(`Failed to purge attendance log for key ${key}`, e);
        }
      }
    }
  }

  // Purge legacy logs as well
  const legacyRaw = localStorage.getItem("offlineid_attendance_logs");
  if (legacyRaw) {
    try {
      const logs = JSON.parse(legacyRaw) as AttendanceLog[];
      const filtered = logs.filter(l => !(l.purged === 1 && l.timestamp < oneDayAgo));
      purgedCount += (logs.length - filtered.length);
      localStorage.setItem("offlineid_attendance_logs", JSON.stringify(filtered));
    } catch {}
  }

  return purgedCount;
}

// ── LEGACY SYNCHRONOUS FALLBACKS FOR TRANSITIONAL COMPATIBILITY ──
export function initializeStorage() {
  const secretKey = getOrCreateSecureKey();
  if (!localStorage.getItem("offlineid_employees")) {
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
  return parsed.sort((a,b) => b.timestamp - a.timestamp);
}

export function saveAttendanceLog(log: AttendanceLog) {
  const logs = getAttendanceLogs();
  logs.unshift(log); // newest first
  localStorage.setItem("offlineid_attendance_logs", JSON.stringify(logs));
}

export function updateAttendanceLogSyncStatus(logIds: string[], synced: number, purged: number) {
  const logs = getAttendanceLogs();
  const updated = logs.map(l => logIds.includes(l.id) ? { ...l, synced, purged } : l);
  localStorage.setItem("offlineid_attendance_logs", JSON.stringify(updated));
}

export function purgeOldLogs() {
  const logs = getAttendanceLogs();
  const oneDayAgo = Date.now() - (24 * 3600 * 1000);
  const beforePurgeCount = logs.length;
  const filtered = logs.filter(l => !(l.purged === 1 && l.timestamp < oneDayAgo));
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

