import React, { useState, useEffect, useRef, useCallback } from "react";
import { Employee, AttendanceLog, GestureChallenge } from "../types";
import { getEmployees, getEmployeesAsync, saveAttendanceLog, saveAttendanceLogAsync } from "../database/db";
import { simulateRecognition, extractPixelEmbedding, matchEmployeeAsync } from "../ml/pipeline";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
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

interface ActiveScanViewProps {
  onSuccess: (log: AttendanceLog) => void;
}

export const ActiveScanView: React.FC<ActiveScanViewProps> = ({ onSuccess }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedGesture, setSelectedGesture] = useState<GestureChallenge>(GestureChallenge.BLINK);
  const [countdown, setCountdown] = useState(5);
  const [scanStatus, setScanStatus] = useState<"scanning" | "processing" | "result" | "failed">("scanning");
  const [simulatedVerdict, setSimulatedVerdict] = useState<"match" | "no_match" | "spoof" | "gesture_fail" | null>(null);
  
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // ── Gesture Scan States
  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const [gesturePhase, setGesturePhase] = useState<'instruction' | 'countdown' | 'capturing' | 'done'>('instruction');
  const [isCapturing, setIsCapturing] = useState(false);
  const [framesCaptured, setFramesCaptured] = useState(0);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    setIsCameraReady(false);
  };

  useEffect(() => {
    let active = true;
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
    console.log('[active-scan] useEffect fired, videoRef.current:', video);

    if (!video) {
      console.error('[active-scan] videoRef.current is NULL — video element not mounted yet');
      setCameraError("Internal render error: Video element ref is not bound.");
      return;
    }

    startCamera(video)
      .then((mediaStream) => {
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        console.log('[active-scan] startCamera resolved');
        streamRef.current = mediaStream;
        setStream(mediaStream);
        return waitForVideoReady(video);
      })
      .then(() => {
        if (active) {
          console.log('[active-scan] waitForVideoReady resolved');
          setIsCameraReady(true);
        }
      })
      .catch((err: any) => {
        console.error('[active-scan] Camera chain failed at:', err.name, err.message);
        if (active) {
          setCameraError(err.message || "Camera access denied or failed");
          stopCamera();
        }
      });

    return () => {
      active = false;
      stopCamera();
    };
  }, [cameraRetryCount]);



  const resetChallenge = () => {
    setCountdown(3);
    setFramesCaptured(0);
    setCurrentGestureIndex(0);
    setGesturePhase('instruction');
    setScanStatus("scanning");
    setMatchResult(null);
    setIsCapturing(false);
  };

  const runGestureScanSequence = useCallback(async () => {
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

  useEffect(() => {
    if (isCameraReady && scanStatus === "scanning" && !isCapturing) {
      runGestureScanSequence();
    }
  }, [isCameraReady, scanStatus, isCapturing, runGestureScanSequence]);

  const handleConfirmAttendance = async () => {
    if (!matchResult || matchResult.employeeId === "threat" || matchResult.employeeId === "not_found") return;

    const newLog: AttendanceLog = {
      id: "log-" + Math.random().toString(36).substr(2, 9),
      employee_id: matchResult.employeeId,
      employee_name: matchResult.employeeName,
      employee_code: matchResult.employeeCode,
      timestamp: Date.now(),
      confidence: matchResult.confidence,
      gesture_used: "Multi-Gesture Liveness Scan",
      synced: 0,
      purged: 0
    };

    await saveAttendanceLogAsync(newLog);
    onSuccess(newLog);
    resetChallenge();
  };

  const gestureLabel = selectedGesture.toLowerCase().replace("_", " ");

  const DEMO_OPTIONS = [
    { key: "match" as const, label: "Match", color: "bg-emerald-600", desc: "Valid employee ID" },
    { key: "no_match" as const, label: "Unknown", color: "bg-yellow-600", desc: "Unrecognized person" },
    { key: "spoof" as const, label: "Spoof", color: "bg-red-600", desc: "Anti-spoof defense" },
    { key: "gesture_fail" as const, label: "Gesture", color: "bg-purple-600", desc: "Challenge timeout" },
  ];

  return (
    <div className="flex-grow flex flex-col justify-between h-full bg-[#181c20] text-white relative overflow-hidden">
      
      {/* Video / Background */}
      <div className="absolute inset-0 z-0 bg-neutral-950">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
            isCameraReady ? "opacity-100" : "opacity-0"
          }`}
        />
        {!stream && cameraError ? (
          <div className="w-full h-full absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col items-center justify-center text-center p-4 z-10 animate-fade-in">
            <div className="w-16 h-16 bg-red-950/50 rounded-full flex items-center justify-center text-red-500 mb-2 border border-red-500/20">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
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
            <div className="w-16 h-16 bg-slate-800/80 rounded-full flex items-center justify-center text-slate-500 mb-2">
              <svg className="w-6 h-6 text-slate-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-white text-xs font-semibold">Camera Offline</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Using simulated scan mode</p>
          </div>
        ) : null}

        {/* Scrim overlay with center cutout */}
        <div
          className="absolute inset-0 bg-black/55 pointer-events-none"
          style={{
            maskImage: 'radial-gradient(ellipse 45% 55% at 50% 50%, transparent 100%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 45% 55% at 50% 50%, transparent 99%, black 100%)'
          }}
        ></div>

        {/* Face guide oval */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-[60%] h-[72%] border-2 border-dashed rounded-[100%] transition-all duration-500 ${
            scanStatus === "failed" ? "scan-guide-failed" : scanStatus === "result" ? "scan-guide-success" : "border-[#005bbf] scan-guide-active"
          }`}></div>
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-4 left-0 w-full px-4 flex justify-between items-center z-10">
        <span className="font-bold text-base tracking-tight drop-shadow-lg">OfflineID</span>
        <div className="glass-dark text-white px-3 py-1 rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          <span className="text-[9px] font-bold uppercase tracking-wider">Offline Mode</span>
        </div>
      </div>

      {/* Demo Controls */}
      <div className="absolute top-14 left-3 right-3 glass-dark p-2.5 rounded-xl z-10 text-[11px]">
        <p className="font-bold text-yellow-400/90 mb-1.5 flex items-center justify-between">
          <span>DEMO CONTROLS</span>
          <span className="text-[9px] text-slate-400 font-normal">Force pipeline outcomes</span>
        </p>
        <div className="grid grid-cols-4 gap-1">
          {DEMO_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setSimulatedVerdict(opt.key); resetChallenge(); }}
              className={`py-1.5 rounded-lg text-[10px] font-semibold transition-spring ${
                simulatedVerdict === opt.key ? `${opt.color} text-white shadow-sm` : "bg-white/10 text-slate-300 hover:bg-white/15"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          {simulatedVerdict ? `→ ${DEMO_OPTIONS.find(o => o.key === simulatedVerdict)?.desc}` : "→ Randomized live stream"}
        </p>
        {employees.length > 0 && (
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
            <span className="text-slate-300 font-bold text-[9px] uppercase tracking-wider">Subject Profile:</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSimulatedVerdict("match");
                resetChallenge();
              }}
              className="bg-neutral-800 text-white border border-white/20 rounded px-2 py-1 text-[10px] outline-none max-w-[170px]"
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

      {/* Gesture UI Overlay */}
      {isCameraReady && scanStatus === "scanning" && (
        <div className="absolute inset-x-0 top-32 flex flex-col items-center z-10 px-4">
          {/* Gesture instruction card */}
          <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3 flex items-center gap-3 border border-white/10 shadow-lg">
            <span className="text-2xl">{GESTURE_SEQUENCE[currentGestureIndex].icon}</span>
            <span className="text-white text-sm font-medium text-center">
              {GESTURE_SEQUENCE[currentGestureIndex].instruction}
            </span>
          </div>

          {/* Countdown pulse ring */}
          {gesturePhase === 'countdown' && (
            <div className="mt-3 w-12 h-12 rounded-full border-4 border-blue-400 flex items-center justify-center animate-pulse bg-black/40 shadow-md">
              <span className="text-white text-lg font-bold">{countdown}</span>
            </div>
          )}

          {/* Capturing flash indicator */}
          {gesturePhase === 'capturing' && (
            <div className="mt-3 px-3 py-1 bg-green-500/80 rounded-full shadow-md">
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
          <p className="text-xs font-semibold text-slate-300 font-medium">Running ONNX pipeline...</p>
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
      {isCameraReady && scanStatus === "scanning" && (
        <div className="absolute bottom-28 inset-x-0 flex justify-center gap-2 z-10">
          {GESTURE_SEQUENCE.map((g, i) => (
            <div
              key={g.id}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < framesCaptured
                  ? 'bg-green-400 scale-125 shadow-sm shadow-green-400/50'
                  : i === currentGestureIndex
                  ? 'bg-blue-400 animate-pulse'
                  : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}


      {/* Bottom Results */}
      <div className="mt-auto relative z-10">
        
        {/* Failed */}
        {scanStatus === "failed" && matchResult && (
          <div className="bg-gradient-to-t from-red-950 to-red-950/95 p-4 border-t border-red-500/50 text-center animate-slide-up">
            <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-sm mb-1">
              <AlertTriangle className="w-5 h-5" />
              <span>{matchResult.employeeName}</span>
            </div>
            <p className="text-xs text-red-200/80">{matchResult.message}</p>
            {matchResult.employeeId === "threat" && (
              <p className="text-[10px] text-red-300/70 font-mono mt-1.5 font-bold bg-red-900/50 px-3 py-1 rounded-lg inline-block">
                fasnet_v1=0.35 • fasnet_v2=0.45 • final={matchResult.score.toFixed(2)} (limit 0.6)
              </p>
            )}
            <button
              onClick={resetChallenge}
              className="mt-3 bg-red-800 hover:bg-red-700 text-white px-5 py-1.5 text-xs font-bold rounded-full active:scale-95 transition-spring block mx-auto"
            >
              Retry Challenge
            </button>
          </div>
        )}

        {/* Success */}
        {scanStatus === "result" && matchResult && (
          <div className="bg-white text-[#181c20] p-4 rounded-t-2xl border-t border-[#c1c6d6] shadow-2xl space-y-3 animate-slide-up">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto"></div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-[#005bbf] to-[#0047a3] flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {matchResult.employeeName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-base">{matchResult.employeeName}</h3>
                  <p className="text-xs text-[#005bbf] font-bold">{matchResult.employeeCode}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="bg-[#86f898] text-[#00722f] px-2.5 py-0.5 rounded-full text-[10px] font-bold block uppercase mb-1 shadow-sm">
                  {(matchResult.confidence * 100).toFixed(1)}% Match
                </span>
                <p className="text-[11px] text-slate-500">Liveness: {matchResult.score.toFixed(2)}</p>
              </div>
            </div>

            <p className="text-[11px] bg-slate-50 p-2.5 rounded-lg text-slate-600 leading-normal border border-slate-200 text-center font-medium">
              {matchResult.message}
            </p>

            <div className="flex gap-2 pt-1">
              <button
                id="btn-confirm-attendance"
                onClick={handleConfirmAttendance}
                className="flex-grow h-11 btn-primary rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Log Attendance
              </button>
              <button
                id="btn-dismiss-result"
                onClick={resetChallenge}
                className="px-4 h-11 border border-slate-300 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-spring"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
