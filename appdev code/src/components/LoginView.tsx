import React, { useState, useEffect, useRef } from "react";
import { AccessRole, Employee, AttendanceLog, GestureChallenge } from "../types";
import { getEmployees, saveAttendanceLog, getOrCreateSecureKey, decryptFaceprint } from "../database/db";
import { simulateRecognition } from "../ml/pipeline";
import { User, Shield, Lock, LogIn, CloudOff, ShieldCheck, Camera, CheckCircle2, AlertTriangle, ArrowRight, UserPlus } from "lucide-react";
import { startCamera, waitForVideoReady } from "../utils/camera";

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

    const list = getEmployees();
    setEmployees(list);
    if (list.length > 0) {
      setSelectedSubjectId(list[0].id);
    }
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

  // ── Countdown Timer Effect ─────────────────────────────────────────
  useEffect(() => {
    if (subMode !== "face" || scanStatus !== "scanning") return;
    if (countdown <= 0) {
      evaluateChallenge(true);
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, scanStatus, subMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  };

  const resetChallenge = () => {
    const gestures = [GestureChallenge.BLINK, GestureChallenge.SMILE, GestureChallenge.TURN_LEFT, GestureChallenge.TURN_RIGHT];
    setSelectedGesture(gestures[Math.floor(Math.random() * gestures.length)]);
    setCountdown(5);
    setScanStatus("scanning");
    setMatchResult(null);
  };

  const evaluateChallenge = (isTimeout = false) => {
    setScanStatus("processing");
    
    setTimeout(() => {
      const gDone = isTimeout ? false : (simulatedVerdict !== "gesture_fail");
      
      const res = simulateRecognition(
        "", 
        selectedGesture, 
        gDone, 
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
          gestureCompleted: gDone,
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
          gestureCompleted: gDone,
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
          gestureCompleted: gDone,
          message: res.message
        });

        // Write attendance log to localStorage
        const newLog: AttendanceLog = {
          id: "log-" + Math.random().toString(36).substr(2, 9),
          employee_id: res.matchedEmployee.id,
          employee_name: res.matchedEmployee.name,
          employee_code: res.matchedEmployee.employee_code,
          timestamp: Date.now(),
          confidence: res.confidence,
          gesture_used: selectedGesture.charAt(0) + selectedGesture.slice(1).toLowerCase().replace("_", " "),
          synced: 0,
          purged: 0
        };
        saveAttendanceLog(newLog);

        // Transition to main dashboard as authenticated Employee after a short delay
        setTimeout(() => {
          onLoginSuccess(AccessRole.EMPLOYEE, res.matchedEmployee!.name);
        }, 1800);
      }
    }, 850);
  };

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
              className={`w-full h-full object-cover scale-x-[-1] ${stream ? "block" : "hidden"}`}
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

            {/* Gesture Prompt Layer */}
            <div className="absolute inset-x-0 top-[40%] flex flex-col items-center justify-center pointer-events-none p-4">
              {scanStatus === "scanning" && (
                <div className="glass-dark px-4 py-2 rounded-xl text-center shadow-lg animate-fade-in flex flex-col items-center gap-1.5">
                  <p className="text-xs font-extrabold tracking-wide uppercase text-white animate-breathe">
                    Please {gestureLabel}
                  </p>
                  <div className="w-7 h-7 rounded-full border border-white/60 flex items-center justify-center bg-black/40">
                    <span className="text-[10px] font-extrabold text-white">{countdown}s</span>
                  </div>
                </div>
              )}

              {scanStatus === "processing" && (
                <div className="glass-dark px-4 py-3 rounded-xl flex flex-col items-center gap-1.5 shadow-lg">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <p className="text-[10px] font-bold text-slate-300">Searching Offline Database...</p>
                </div>
              )}
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
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-full text-[10px] font-bold active:scale-95 transition-spring"
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
                onClick={() => evaluateChallenge(false)}
                className="w-full h-11 btn-primary rounded-full flex items-center justify-center gap-2 text-xs font-bold shadow-md"
              >
                <Camera className="w-4 h-4" />
                Authenticate Face
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
