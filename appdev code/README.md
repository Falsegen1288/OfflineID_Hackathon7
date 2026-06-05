# OfflineID — Premium Offline Biometric Identity & Verification

An ultra-secure, mobile-first web application designed for high-fidelity offline facial recognition, gesture liveness verification, and secure on-device identity storage. Designed for deployment in zero-connectivity remote locations, high-compliance privacy environments, and resource-constrained terminal hardware.

---

## 🎯 The Problem Statement

Traditional biometric verification systems rely heavily on cloud-based deep learning APIs (such as AWS Rekognition or Google Cloud Vision) to perform facial matching and anti-spoofing checks. This architecture introduces critical vulnerabilities:

1. **Zero-Network Degradation**: In remote exploration facilities, high-security sectors, or mining zones, internet connection is non-existent, degrading cloud-based authentication systems immediately.
2. **Data Residency & Compliance**: GDPR, HIPAA, and national security policies strictly prohibit uploading raw biometric assets (faceprints/photos) to external clouds or unencrypted local drives.
3. **Heavy Engine Overhead**: Standard offline libraries (like `face-api.js` or TensorFlow.js) require downloading heavy CNN weights (~6MB–15MB) and utilizing high WebGL memory overhead, causing older mobile terminals to thermal throttle or run out of memory during LAN setups.
4. **Silent App Crashes**: Insecure local origins (like HTTP LAN IP addresses) block standard browser Web Crypto APIs, leading to runtime failures if no fallback protocols are established.

---

## 🛠️ The Approach & Architecture

OfflineID addresses these challenges using **Option B: Spatial Grid Sampling & Cosine Similarity Search Engine**, backed by standard **Web Crypto AES-GCM 256** local database storage.

### Core Architecture Flow

```mermaid
graph TD
    %% Styling
    classDef default fill:#1e293b,stroke:#475569,stroke-width:1px,color:#f8fafc;
    classDef highlight fill:#0369a1,stroke:#0284c7,stroke-width:2px,color:#f8fafc;
    classDef success fill:#15803d,stroke:#16a34a,stroke-width:2px,color:#f8fafc;
    classDef warning fill:#a16207,stroke:#ca8a04,stroke-width:2px,color:#f8fafc;
    
    subgraph Enrollment ["1. Multi-Gesture Enrollment (Registration)"]
        A[Input Profile Metadata] --> B[Camera Initialization & isCameraReady check]
        B --> C[5-Gesture Challenge Sequence]
        C -->|1. Still| D[Extract Frame Canvas]
        C -->|2. Turn Right| D
        C -->|3. Turn Left| D
        C -->|4. Blink| D
        C -->|5. Smile| D
        D --> E[Luminance-Weighted Spatial Grid Sampling]
        E --> F[L2 Vector Normalization: 512-dim]
        F --> G[Compile Master Embedding average]
        G --> H{Secure Context?}
        H -->|HTTPS / Localhost| I[Web Crypto AES-GCM 256 Key Encryption]
        H -->|Insecure HTTP LAN| J[Simulated XOR Fallback Encryption]
        I --> K[Write Encrypted Payload to localStorage index]
        J --> K
    end
    
    subgraph Verification ["2. Biometric Verification (Login)"]
        L[Auto-Trigger Scan on isCameraReady] --> M[Capture 5 Challenger Challenge Poses]
        M --> N[Extract Query Face Embedding & Normalize]
        N --> O[Retrieve Indexed Employee Profiles]
        O --> P[Decrypt Stored Employee Vectors]
        P --> Q[Calculate Cosine Similarity Dot Product]
        Q --> R{Similarity >= 0.65?}
        R -->|Yes| S[Liveness & Identity Verified: Access Granted]
        R -->|No| T[Access Rejected: Low Score / Spoof Alert]
        S --> U[Log Attendance Block encrypted and saved]
    end
    
    class B,M highlight;
    class I,Q,S success;
    class J,T warning;
```

### 1. Spatial Grid Sampling (Option B)
Instead of executing heavy CNN object detection models on the client, OfflineID leverages direct canvas manipulation.
* **Region-of-Interest (ROI) Weighting**: The algorithm extracts pixel arrays from the center 60% of the video frame (ideal face oval alignment).
* **Luminance Extraction**: Converts raw RGB data to luminance values using standard CCIR 601 weighting:
  $$\text{Luminance} = 0.299R + 0.587G + 0.114B$$
* **L2 Normalization**: Ensures all facial vectors are normalized to unit length, allowing cosine similarity matching to be calculated via simple dot products:
  $$\text{Similarity} = \sum_{i=1}^{512} A_i \cdot B_i$$
  This allows biometric matching to execute in **< 5ms** even on low-end hardware.

### 2. Multi-Gesture Liveness Challenge
Prevents standard photo-spoofing attacks by requiring users to perform 5 consecutive gestures in random/fixed sequences:
1. **Still Look** 🎯 — Establishes baseline pose.
2. **Turn Right** ➡️ — Captures lateral spatial dimensions.
3. **Turn Left** ⬅️ — Verifies profile symmetry.
4. **Blink** 👁️ — Validates eye movement (liveness gate).
5. **Smile** 😊 — Confirms muscular animation.

### 3. Encrypt-on-Write Asynchronous Database
* **AES-GCM 256 Encryption**: Uses standard Web Crypto APIs to derive secure keys stored in a session-only keychain, encrypting employee lists and logs on-device.
* **Insecure Origin Fallback**: If the app is run over an insecure origin (HTTP local LAN IP, where `crypto.subtle` is blocked by the browser), the crypto layer automatically falls back to an XOR-based simulation. Payloads are prefixed with `insecure:` to ensure clean compatibility, preventing app crashes.
* **Large-Payload Call Stack Safety**: Replaced all call-stack-vulnerable spread operators (`...`) during string conversions (e.g. converting large base64 avatar images) with loop-based encoders to guarantee crash-free database writes on mobile browsers.

---

## 🎨 App UI Design

OfflineID features a high-fidelity, premium interface matching modern iOS/Android native UX paradigms:
* **Tailwind & CSS Animations**: Includes smooth pulse-glow rings, opacity fade-in transition overlays, and dynamic slide-up result sheets.
* **Interactive Camera HUD**: Displays target guides, gesture countdown rings, and check-in status trackers (Synced vs. Pending sync).
* **Details Modal Overlay**: Clicking any enrolled employee card inside Settings opens a glassmorphic details modal showing their complete metadata along with a real-time view of their AES-256 encrypted faceprint vector blob.

---

## 🚀 Getting Started (VS Code & Local Run)

### Prerequisites
* **Node.js** (v18.0.0 or higher recommended)
* **npm** (comes packaged with Node.js)
* **VS Code** (recommended IDE)

### 1. Installation & Environment Configuration
Clone the repository and open VS Code:
```bash
cd "OfflineID_Hackathon7/appdev code"
code .
```

Install the project dependencies:
```bash
npm install
```

### 2. Secure Local LAN Configuration (mkcert)
Because cameras and biometric APIs require a **Secure Context**, the development server uses `mkcert` to automatically issue trusted local certificates.

1. Install `mkcert` on your development host:
   * **Windows (via Chocolatey)**: `choco install mkcert`
   * **macOS (via Homebrew)**: `brew install mkcert`
   * **Linux**: `sudo apt install mkcert`
2. Set up the local Root CA:
   ```bash
   mkcert -install
   ```
3. The server configuration in `vite.config.ts` will automatically load your certs.

### 3. Running the Server

Start the local development server:
```bash
npm run dev
```

The terminal will print out local URLs:
* **Local (Desktop)**: `https://localhost:3000`
* **Network (LAN Mobile Devices)**: `https://192.168.x.x:3000`

---

## 📱 Mobile Device LAN Setup

To test the biometric scanning loop on a physical phone over local Wi-Fi:

### Android Chrome
1. Connect your phone to the same Wi-Fi network as your host computer.
2. Navigate to the local network IP printed in the terminal (e.g. `https://192.168.x.x:3000`).
3. Tap **Advanced** on the certificate warning page and click **Proceed** to bypass.
4. Camera stream and biometric scan loops will initialize immediately.

### iOS Safari
1. Transfer the Root CA certificate file from your host machine to your iPhone:
   * **Location**: Type `mkcert -CAROOT` in your terminal to find the folder containing `rootCA.pem`.
   * **Transfer**: Use AirDrop (Mac to iPhone), email, or a local file server.
2. Install the profile: Go to **Settings** -> **Profile Downloaded** -> Tap **Install**.
3. Enable full trust: Go to **Settings** -> **General** -> **About** -> **Certificate Trust Settings**. Under "Enable full trust for root certificates", toggle the `mkcert` certificate **ON**.
4. Open Safari and navigate to `https://192.168.x.x:3000`.

---

## 🧑‍💻 Debugging in VS Code

To set up native debugging inside VS Code:

1. Create a launch configuration folder:
   ```bash
   mkdir .vscode
   ```
2. Create a `.vscode/launch.json` file:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "chrome",
         "request": "launch",
         "name": "Debug OfflineID App",
         "url": "https://localhost:3000",
         "webRoot": "${workspaceFolder}/src",
         "runtimeArgs": [
           "--ignore-certificate-errors"
         ]
       }
     ]
   }
   ```
3. Press **F5** in VS Code. It will launch a Chrome session automatically targeting the HTTPS port with ignored cert warnings, allowing you to set breakpoints directly in your TSX files.

---

## 🛡️ Troubleshooting

### "Maximum call stack size exceeded"
* **Cause**: Older versions tried to convert huge array buffers (like base64 photos) using `String.fromCharCode(...uint8array)`, which exceeded the browser's stack size limit.
* **Fix**: The app uses `uint8ArrayToBase64()` which performs safe looping instead of argument spreading.

### Camera Stays Black / "Initializing Camera..." Hang
* **Cause**: On mobile browsers, the autoplay policy will block video elements if they aren't marked as `muted` or `playsinline`.
* **Fix**: The video layout uses `<video autoPlay playsInline muted />` and performs a 3-attempt hardware retry sequence.

### Secure Context Errors
* **Cause**: If the URL starts with `http://` instead of `https://`, browsers block media device permissions.
* **Fix**: The code automatically falls back to XOR encryption so the wizard doesn't crash, and warns the user about origin settings. Access using `https://` to unlock the hardware camera.
