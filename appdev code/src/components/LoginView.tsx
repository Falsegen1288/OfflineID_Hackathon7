import React, { useState, useEffect, useRef, useCallback } from "react";
import { AccessRole, Employee, AttendanceLog, GestureChallenge } from "../types";
import { getEmployees, getEmployeesAsync, saveAttendanceLog, saveAttendanceLogAsync, getOrCreateSecureKey, decryptFaceprint } from "../database/db";
import { simulateRecognition, extractPixelEmbedding, matchEmployeeAsync } from "../ml/pipeline";
import { User, Shield, Lock, LogIn, CloudOff, ShieldCheck, Camera, CheckCircle2, AlertTriangle, ArrowRight, UserPlus } from "lucide-react";
import { startCamera, waitForVideoReady, captureWithRetry } from "../utils/camera";

const GESTURE_SEQUENCE = [
  { id: 'still', instruction: 'Hold still and look at the camera', icon: '🎯', holdMs: 2000 },
  { id: 'turn_right', instruction: 'Slowly turn your head to the right', icon: '➡️', holdMs: 2500 },
  { id: 'turn_left', instruction: 'Slowly turn your head to the left', icon: '⬅️', holdMs: 2500 },
  { id: 'blink', instruction: 'Blink your eyes naturally', icon: '👁️', holdMs: 3000 },
  { id: 'smile', instruction: 'Give a natural smile', icon: '😊', holdMs: 2000 },
] as const;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const l2Normalize = (v: number[]): number[] => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) + 1e-10;
  return v.map(x => x / norm);
};

interface LoginViewProps {
  onLoginSuccess: (role: AccessRole, username: string) => void;
  onRegisterClick: () => void;
  registrationSuccessMsg?: string | null;
  clearSuccessMsg?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onRegisterClick,
  registrationSuccessMsg,
  clearSuccessMsg,
}) => {
  const [subMode, setSubMode] = useState<"landing" | "face" | "password">("landing");
  
  // ── Face Scan Login States ─────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedGesture, setSelectedGesture] = useState<GestureChallenge>(GestureChallenge.BLINK);
  const [countdown, setCountdown] = useState(5);
  const [scanStatus, setScanStatus] = useState<"scanning" | "processing" | "result" | "failed">("scanning");
  const [simulatedVerdict, setSimulatedVerdict] = useState<"match" | "no_match" | "spoof" | "gesture_fail" | null>("match");
  
  const [matchResult, setMatchResult] = useState<{
    employeeName: string;
    employeeCode: string;
    employeeId: string;
    confidence: number;
    score: number;
    passed: boolean;
    gestureCompleted: boolean;
    message: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Gesture Login Scan States
  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const [gesturePhase, setGesturePhase] = useState<'instruction' | 'countdown' | 'capturing' | 'done'>('instruction');
  const [isCapturing, setIsCapturing] = useState(false);
  const [framesCaptured, setFramesCaptured] = useState(0);

  // ── Password Admin States ──────────────────────────────────────────
  const [adminRole, setAdminRole] = useState<AccessRole>(AccessRole.ADMIN);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryCount, setCameraRetryCount] = useState(0);

  // ── Camera Initialization Effect ───────────────────────────────────
  useEffect(() => {
    let active = true;
    if (subMode !== "face") {
      stopCamera();
      return;
    }

    getEmployeesAsync().then((list) => {
      if (!active) return;
      setEmployees(list);
      if (list.length > 0) {
        setSelectedSubjectId(list[0].id);
      }
    });
    resetChallenge();
    setCameraError(null);

    const video = videoRef.current;
    console.log('[login] useEffect fired, videoRef.current:', video);

    if (!video) {
      console.error('[login] videoRef.current is NULL — video element not mounted yet');
      setCameraError("Internal render error: Video element ref is not bound.");
      return;
    }

    startCamera(video)
      .then((mediaStream) => {
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        console.log('[login] startCamera resolved');
        streamRef.current = mediaStream;
        setStream(mediaStream);
        return waitForVideoReady(video);
      })
      .then(() => {
        if (active) {
          console.log('[login] waitForVideoReady resolved');
        }
      })
      .catch((err: any) => {
        console.error('[login] Camera chain failed at:', err.name, err.message);
        if (active) {
          setCameraError(err.message || "Camera access denied or failed");
          stopCamera();
        }
      });

    return () => {
      active = false;
      stopCamera();
    };
  }, [subMode, cameraRetryCount]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  };

  const resetChallenge = () => {
    setCountdown(3);
    setFramesCaptured(0);
    setCurrentGestureIndex(0);
    setGesturePhase('instruction');
    setScanStatus("scanning");
    setMatchResult(null);
    setIsCapturing(false);
  };

  const runGestureLoginSequence = useCallback(async () => {
    setIsCapturing(true);
    setFramesCaptured(0);
    setScanStatus("scanning");
    setMatchResult(null);

    const queryEmbeddings: number[][] = [];

    try {
      for (let i = 0; i < GESTURE_SEQUENCE.length; i++) {
        const gesture = GESTURE_SEQUENCE[i];

        // Phase 1: Show instruction
        setCurrentGestureIndex(i);
        setGesturePhase('instruction');
        await delay(1800); // user reads the instruction

        // Phase 2: Countdown
        setGesturePhase('countdown');
        for (let c = 3; c >= 1; c--) {
          setCountdown(c);
          await delay(700);
        }

        // Phase 3: Capture the frame
        setGesturePhase('capturing');
        await delay(gesture.holdMs); // wait for user to hold the gesture

        let vector: number[] | null = null;
        if (stream && videoRef.current) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = videoRef.current.videoWidth || 400;
          tempCanvas.height = videoRef.current.videoHeight || 500;
          const dataUrl = await captureWithRetry(videoRef.current, tempCanvas);
          if (dataUrl) {
            vector = extractPixelEmbedding(tempCanvas);
          }
        } else {
          // Simulator fallback
          await delay(300);
          const rawVec = new Array(512).fill(0).map(() => Math.random());
          vector = l2Normalize(rawVec);
        }

        if (vector) {
          queryEmbeddings.push(vector);
        }

        setFramesCaptured(i + 1);
        await delay(400);
      }

      setGesturePhase('done');
      setIsCapturing(false);
      setScanStatus("processing");
      
      const requiredGesture = GestureChallenge.BLINK; // fallback info log
      
      const res = await matchEmployeeAsync(
        queryEmbeddings,
        requiredGesture,
        simulatedVerdict !== "gesture_fail",
        simulatedVerdict || undefined,
        selectedSubjectId || undefined
      );

      if (!res.livenessPassed) {
        setScanStatus("failed");
        setMatchResult({
          employeeName: "SPOOF ATTACK",
          employeeCode: "METRICS_REJECTED",
          employeeId: "threat",
          confidence: 0,
          score: res.livenessScore,
          passed: false,
          gestureCompleted: true,
          message: res.message
        });
      } else if (res.matchedEmployee === null) {
        setScanStatus("failed");
        setMatchResult({
          employeeName: "Unrecognized Person",
          employeeCode: "NO_MATCH",
          employeeId: "not_found",
          confidence: res.confidence,
          score: res.livenessScore,
          passed: true,
          gestureCompleted: true,
          message: res.message
        });
      } else {
        setScanStatus("result");
        setMatchResult({
          employeeName: res.matchedEmployee.name,
          employeeCode: res.matchedEmployee.employee_code,
          employeeId: res.matchedEmployee.id,
          confidence: res.confidence,
          score: res.livenessScore,
          passed: true,
          gestureCompleted: true,
          message: res.message
        });

        // Write attendance log
        const newLog: AttendanceLog = {
          id: "log-" + Math.random().toString(36).substr(2, 9),
          employee_id: res.matchedEmployee.id,
          employee_name: res.matchedEmployee.name,
          employee_code: res.matchedEmployee.employee_code,
          timestamp: Date.now(),
          confidence: res.confidence,
          gesture_used: "Multi-Gesture Liveness Scan",
          synced: 0,
          purged: 0
        };
        await saveAttendanceLogAsync(newLog);

        setTimeout(() => {
          onLoginSuccess(AccessRole.EMPLOYEE, res.matchedEmployee!.name);
        }, 1800);
      }
    } catch (err: any) {
      console.error("Biometric matching error:", err);
      setScanStatus("failed");
      setMatchResult({
        employeeName: "Internal Error",
        employeeCode: "MATCH_FAILED",
        employeeId: "error",
        confidence: 0,
        score: 0,
        passed: false,
        gestureCompleted: false,
        message: err.message || "Failed to process face scans."
      });
      setIsCapturing(false);
    }
  }, [stream, selectedSubjectId, simulatedVerdict]);

  // ── Password Form Submit ───────────────────────────────────────────
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim()) {
      setErrorMsg("Please enter a username.");
      return;
    }
    if (adminPassword.length < 4) {
      setErrorMsg("Password must be at least 4 characters.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess(adminRole, adminUsername);
    }, 1200);
  };

  const gestureLabel = selectedGesture.toLowerCase().replace("_", " ");
  
  const DEMO_OPTIONS = [
    { key: "match" as const, label: "Match", color: "bg-emerald-600", desc: "Valid employee ID" },
    { key: "no_match" as const, label: "Unknown", color: "bg-yellow-600", desc: "Unrecognized person" },
    { key: "spoof" as const, label: "Spoof", color: "bg-red-600", desc: "Anti-spoof defense" },
    { key: "gesture_fail" as const, label: "Gesture", color: "bg-purple-600", desc: "Challenge timeout" },
  ];

  return (
    <div id="login-view" className="flex-grow flex flex-col justify-between p-4 bg-[#f7f9ff] animate-fade-in overflow-hidden relative">
      
      {/* ── SUBMODE A: LANDING MENU PAGE (CHOOSE LOGIN OR REGISTER) ───── */}
      {subMode === "landing" && (
        <div className="flex-grow flex flex-col justify-between h-full py-2 animate-fade-in">
          
          {/* Branding Header */}
          <div className="flex flex-col items-center text-center gap-2 mt-6 animate-fade-in-scale">
            <div className="w-20 h-20 mb-2">
              <div className="w-full h-full bg-gradient-to-br from-[#005bbf] to-[#0047a3] rounded-[20px] flex items-center justify-center shadow-lg shadow-[#005bbf]/20 relative">
                <div className="absolute top-1.5 left-1.5 w-4 h-4 border-t-2 border-l-2 border-white/80"></div>
                <div className="absolute top-1.5 right-1.5 w-4 h-4 border-t-2 border-r-2 border-white/80"></div>
                <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-b-2 border-l-2 border-white/80"></div>
                <div className="absolute bottom-1.5 right-1.5 w-4 h-4 border-b-2 border-r-2 border-white/80"></div>
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-[#181c20] tracking-tight">OfflineID</h1>
            <p className="text-xs text-[#414754]">Offline Facial Recognition & Liveness Detection</p>
          </div>

          {registrationSuccessMsg && (
            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100 text-xs font-semibold my-2 flex items-center justify-between animate-fade-in shadow-sm">
              <span>{registrationSuccessMsg}</span>
              <button onClick={clearSuccessMsg} className="text-emerald-800 hover:text-emerald-950 font-bold ml-2">×</button>
            </div>
          )}

          {/* Options Grid */}
          <div className="glass-card p-6 rounded-2xl flex flex-col gap-4 mt-2 animate-fade-in anim-delay-200" style={{ animationFillMode: 'both' }}>
            <div className="text-center mb-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select Application Mode</p>
            </div>

            <button
              onClick={() => { setSubMode("face"); if (clearSuccessMsg) clearSuccessMsg(); }}
              className="w-full h-14 btn-primary rounded-xl font-bold flex items-center justify-between px-5 transition-spring active:scale-95 shadow-md shadow-[#005bbf]/15 group"
            >
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-white" />
                <div className="text-left">
                  <p className="text-xs text-white font-extrabold">Biometric Login</p>
                  <p className="text-[10px] text-white/70 font-semibold">Scan face to check-in</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onRegisterClick}
              className="w-full h-14 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl font-bold flex items-center justify-between px-5 transition-spring active:scale-95 group text-slate-700"
            >
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-[#005bbf]" />
                <div className="text-left">
                  <p className="text-xs text-slate-800 font-extrabold">Register Face</p>
                  <p className="text-[10px] text-slate-500 font-semibold">Enrol new biometric ID</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Footer controls */}
          <div className="text-center mt-3 animate-fade-in anim-delay-400" style={{ animationFillMode: 'both' }}>
            <button
              onClick={() => setSubMode("password")}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
            >
              Admin Console (Password Override)
            </button>
          </div>

        </div>
      )}

      {/* ── SUBMODE B: ACTIVE FACE SCAN SCANNER ──────────────────────── */}
      {subMode === "face" && (
        <div className="flex-grow flex flex-col justify-between h-full animate-fade-in">
          
          {/* Header */}
          <div className="text-center mt-1">
            <h1 className="text-2xl font-extrabold text-[#181c20] tracking-tight">Biometric Login</h1>
            <p className="text-[11px] text-[#414754]">Perform the gesture liveness challenge to verify.</p>
          </div>

          {/* Biometric Camera View */}
          <div className="relative w-full aspect-[3/3.8] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-md flex items-center justify-center my-2.5">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                stream ? "opacity-100" : "opacity-0"
              }`}
            />
            {!stream && cameraError ? (
              <div className="w-full h-full absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col items-center justify-center text-center p-4 z-10 animate-fade-in">
                <div className="w-12 h-12 bg-red-950/50 rounded-full flex items-center justify-center text-red-500 mb-2 border border-red-500/20">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <p className="text-red-400 text-xs font-bold">Camera Initialization Failed</p>
                <p className="text-slate-400 text-[10px] mt-1 max-w-[220px] leading-normal">{cameraError}</p>
                <button
                  onClick={() => {
                    setCameraError(null);
                    setCameraRetryCount(prev => prev + 1);
                  }}
                  className="mt-3 bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 px-4 py-1.5 rounded-full text-[10px] font-bold active:scale-95 transition-spring cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            ) : !stream ? (
              <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col items-center justify-center text-center p-4 animate-fade-in">
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-slate-500 mb-2">
                  <Camera className="w-5 h-5 animate-pulse" />
                </div>
                <p className="text-white text-xs font-semibold">Camera Offline</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Using simulated scan mode</p>
              </div>
            ) : null}

            {/* Gesture UI Overlay */}
            {stream && scanStatus === "scanning" && (
              <div className="absolute inset-x-0 top-4 flex flex-col items-center z-20 px-4">
                {/* Gesture instruction card */}
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3 flex items-center gap-3 border border-white/10">
                  <span className="text-2xl">{GESTURE_SEQUENCE[currentGestureIndex].icon}</span>
                  <span className="text-white text-sm font-medium text-center">
                    {GESTURE_SEQUENCE[currentGestureIndex].instruction}
                  </span>
                </div>

                {/* Countdown pulse ring */}
                {gesturePhase === 'countdown' && (
                  <div className="mt-3 w-12 h-12 rounded-full border-4 border-blue-400 flex items-center justify-center animate-pulse bg-black/40">
                    <span className="text-white text-lg font-bold">{countdown}</span>
                  </div>
                )}

                {/* Capturing flash indicator */}
                {gesturePhase === 'capturing' && (
                  <div className="mt-3 px-3 py-1 bg-green-500/80 rounded-full">
                    <span className="text-white text-xs font-semibold tracking-wider">
                      ● CAPTURING
                    </span>
                  </div>
                )}
              </div>
            )}

            {scanStatus === "processing" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 z-20">
                <div className="w-8 h-8 border-3 border-[#005bbf]/40 border-t-[#005bbf] rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-300 font-medium">Searching Offline Database...</p>
                <div className="flex gap-1 mt-1">
                  {["SCRFD", "FASNet", "ArcFace"].map((step) => (
                    <span key={step} className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-[#005bbf]/20 text-[#60a5fa]">
                      {step}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Frame progress dots at bottom */}
            {stream && scanStatus === "scanning" && (
              <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2 z-20">
                {GESTURE_SEQUENCE.map((g, i) => (
                  <div
                    key={g.id}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i < framesCaptured
                        ? 'bg-green-400 scale-125'
                        : i === currentGestureIndex
                        ? 'bg-blue-400 animate-pulse'
                        : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Oval Cutout Overlay */}
            <div className="absolute inset-0 bg-black/60 pointer-events-none"
              style={{
                maskImage: 'radial-gradient(ellipse 42% 52% at 50% 50%, transparent 100%, black 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 42% 52% at 50% 50%, transparent 100%, black 100%)'
              }}
            ></div>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-[60%] h-[72%] border-2 border-dashed rounded-[100%] transition-colors duration-300 ${
                scanStatus === "result" ? "border-emerald-400 scan-guide-success" : scanStatus === "failed" ? "border-red-400 animate-shake" : "border-white/60 animate-breathe"
              }`}></div>
            </div>

            {/* Result Popups */}
            {scanStatus === "result" && matchResult && (
              <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 animate-fade-in z-20">
                <div className="bg-white text-slate-800 p-5 rounded-2xl shadow-2xl text-center w-full max-w-[260px] animate-fade-in-scale space-y-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-white shadow-md animate-bounce">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{matchResult.employeeName}</h3>
                    <p className="text-[10px] text-[#005bbf] font-bold">{matchResult.employeeCode}</p>
                    <p className="text-[10px] text-emerald-600 font-extrabold uppercase mt-1 bg-emerald-50 py-0.5 px-2 rounded inline-block">
                      {(matchResult.confidence * 100).toFixed(1)}% Match • Present
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                    Identity verified. Logging in...
                  </p>
                </div>
              </div>
            )}

            {scanStatus === "failed" && matchResult && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 animate-fade-in z-20 text-center">
                <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white mb-2 shadow-md animate-pulse">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-red-500">{matchResult.employeeName}</h3>
                <p className="text-[10px] text-slate-300 px-4 mt-1 leading-normal">{matchResult.message}</p>
                <button
                  onClick={resetChallenge}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-full text-[10px] font-bold active:scale-95 transition-spring cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Capture Actions & Demo Controls */}
          <div className="space-y-2.5">
            {scanStatus === "scanning" && (
              <button
                onClick={runGestureLoginSequence}
                disabled={isCapturing}
                className="w-full h-11 btn-primary rounded-full flex items-center justify-center gap-2 text-xs font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="w-4 h-4" />
                Start Liveness Scan
              </button>
            )}

            {/* Simulation controls */}
            <div className="glass-card p-2.5 rounded-xl text-[10px] border border-slate-200">
              <div className="flex justify-between items-center mb-1.5 text-slate-500 font-bold uppercase tracking-wider">
                <span>Simulation controls</span>
                <span className="text-[8px] text-slate-400 font-normal">Select identity to test</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {DEMO_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setSimulatedVerdict(opt.key); resetChallenge(); }}
                    className={`py-1 rounded-md text-[9px] font-semibold transition-spring ${
                      simulatedVerdict === opt.key ? `${opt.color} text-white shadow-sm` : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              
              {employees.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-1 pt-1.5 border-t border-slate-100">
                  <span className="text-slate-500 font-bold text-[8px] uppercase tracking-wider">Simulate Person:</span>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => {
                      setSelectedSubjectId(e.target.value);
                      setSimulatedVerdict("match");
                      resetChallenge();
                    }}
                    className="bg-slate-50 text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 text-[9px] outline-none max-w-[170px] font-bold"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Go Back Link */}
            <div className="text-center pt-1">
              <button
                onClick={() => { setSubMode("landing"); stopCamera(); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
              >
                ← Return to Menu
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── SUBMODE C: ADMIN CREDENTIAL OVERRIDE ─────────────────────── */}
      {subMode === "password" && (
        <div className="flex-grow flex flex-col justify-between h-full py-2 animate-fade-in">
          
          <div className="flex flex-col items-center text-center gap-2 mt-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#005bbf] to-[#0047a3] rounded-[16px] flex items-center justify-center shadow-md shadow-[#005bbf]/20 relative">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#181c20] tracking-tight">Admin Console</h1>
            <p className="text-xs text-[#414754]">Enter credentials to access configuration.</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="glass-card p-5 rounded-2xl flex flex-col gap-4 mt-4">
            <div className="flex p-1 bg-slate-100 rounded-lg h-10 text-[11px]">
              <button
                type="button"
                className={`flex-grow flex items-center justify-center gap-1 rounded font-semibold transition-spring ${
                  adminRole === AccessRole.ADMIN ? "bg-white text-[#005bbf] shadow-sm" : "text-slate-500 hover:bg-slate-200"
                }`}
                onClick={() => setAdminRole(AccessRole.ADMIN)}
              >
                Admin Group
              </button>
              <button
                type="button"
                className={`flex-grow flex items-center justify-center gap-1 rounded font-semibold transition-spring ${
                  adminRole === AccessRole.EMPLOYEE ? "bg-white text-[#005bbf] shadow-sm" : "text-slate-500 hover:bg-slate-200"
                }`}
                onClick={() => setAdminRole(AccessRole.EMPLOYEE)}
              >
                Employee (Override)
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User className="w-3.5 h-3.5" /></span>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="Enter admin code"
                    disabled={isLoading}
                    className="w-full h-10 pl-9 pr-3 bg-white border border-slate-300 rounded-lg focus:border-[#005bbf] outline-none text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Password</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-3.5 h-3.5" /></span>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full h-10 pl-9 pr-3 bg-white border border-slate-300 rounded-lg focus:border-[#005bbf] outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <p className="text-red-600 text-xs font-semibold text-center bg-red-50 p-2 rounded-lg border border-red-100">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 btn-primary rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  Verifying Keystore...
                </>
              ) : (
                <>
                  Log In Console
                  <LogIn className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => { setSubMode("landing"); setErrorMsg(""); }}
              className="w-full h-10 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-spring active:scale-95"
            >
              ← Back to Menu
            </button>
          </div>
        </div>
      )}

      {/* Offline badges & info */}
      <div className="flex flex-col items-center gap-2 mt-4">
        <div className="flex items-center gap-1.5 bg-[#ffdfa0] text-[#5c4300] px-3.5 py-1.5 rounded-full border border-[#987000]/40 shadow-sm">
          <CloudOff className="w-3.5 h-3.5" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider">
            Local Storage Active (OFFLINE)
          </span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">
            Fully Encrypt-On-Write Storage
          </span>
        </div>
      </div>

    </div>
  );
};
