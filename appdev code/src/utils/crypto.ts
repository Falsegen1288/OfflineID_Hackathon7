const KEYCHAIN_KEY = 'offlineid:keychain';
const ALGO = { name: 'AES-GCM', length: 256 };

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binString = "";
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    binString += String.fromCharCode(arr[i]);
  }
  return btoa(binString);
}

// Generate or retrieve the session key
export async function getOrCreateSessionKey(): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn("SubtleCrypto is not available (insecure context or unsupported browser). Using simulated fallback.");
    return null;
  }

  const stored = localStorage.getItem(KEYCHAIN_KEY);

  if (stored) {
    try {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      return await crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
    } catch (e) {
      console.warn("Failed to import key, generating a new one", e);
    }
  }

  try {
    const key = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
    const exported = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(KEYCHAIN_KEY, uint8ArrayToBase64(new Uint8Array(exported)));
    return key;
  } catch (err) {
    console.error("Failed to generate cryptographic key:", err);
    return null;
  }
}

export async function encryptRecord(key: CryptoKey | null, data: object): Promise<string> {
  if (!key || typeof crypto === 'undefined' || !crypto.subtle) {
    // Insecure fallback: stringify + XOR simulation
    const serialized = JSON.stringify(data);
    const encrypted = new Uint8Array(serialized.length);
    const keyStr = "insecure_fallback_key";
    for (let i = 0; i < serialized.length; i++) {
      const charCode = serialized.charCodeAt(i);
      const keyChar = keyStr.charCodeAt(i % keyStr.length);
      encrypted[i] = charCode ^ keyChar;
    }
    const b64 = uint8ArrayToBase64(encrypted);
    return `insecure:${b64}`;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Store as: base64(iv) + ':' + base64(ciphertext)
  const ivB64 = uint8ArrayToBase64(iv);
  const ctB64 = uint8ArrayToBase64(new Uint8Array(ciphertext));
  return `${ivB64}:${ctB64}`;
}

export async function decryptRecord<T>(key: CryptoKey | null, payload: string): Promise<T> {
  if (payload.startsWith("insecure:")) {
    const b64 = payload.substring(9);
    const binStr = atob(b64);
    let decrypted = "";
    const keyStr = "insecure_fallback_key";
    for (let i = 0; i < binStr.length; i++) {
      const charCode = binStr.charCodeAt(i);
      const keyChar = keyStr.charCodeAt(i % keyStr.length);
      decrypted += String.fromCharCode(charCode ^ keyChar);
    }
    return JSON.parse(decrypted) as T;
  }

  if (!key || typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error("Crypto session unavailable and payload is not in fallback format");
  }

  const [ivB64, ctB64] = payload.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
