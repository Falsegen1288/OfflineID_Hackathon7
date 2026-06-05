const KEYCHAIN_KEY = 'offlineid:keychain';
const ALGO = { name: 'AES-GCM', length: 256 };

// Generate or retrieve the session key
export async function getOrCreateSessionKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(KEYCHAIN_KEY);

  if (stored) {
    try {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      return await crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
    } catch (e) {
      console.warn("Failed to import key, generating a new one", e);
    }
  }

  const key = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(KEYCHAIN_KEY, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

export async function encryptRecord(key: CryptoKey, data: object): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Store as: base64(iv) + ':' + base64(ciphertext)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivB64}:${ctB64}`;
}

export async function decryptRecord<T>(key: CryptoKey, payload: string): Promise<T> {
  const [ivB64, ctB64] = payload.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
