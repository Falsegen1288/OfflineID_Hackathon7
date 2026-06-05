import React, { useState, useRef, useEffect, useCallback } from "react";
import { Employee } from "../types";
import { getOrCreateSecureKey, encryptFaceprint, saveEmployee } from "../database/db";
import { handleFiveFrameAveraging } from "../ml/pipeline";
import { ArrowRight, Camera, CheckCircle2, AlertCircle } from "lucide-react";
import { startCamera, waitForVideoReady, captureWithRetry } from "../utils/camera";

const GESTURE_SEQUENCE = [
  {
    id: 'still',
    instruction: 'Hold still and look at the camera',
    icon: '🎯',
    holdMs: 1500,   // how long user must hold before frame is captured
  },
  {
    id: 'turn_right',
    instruction: 'Slowly turn your head to the right',
    icon: '➡️',
    holdMs: 1200,
  },
  {
    id: 'turn_left',
    instruction: 'Slowly turn your head to the left',
    icon: '⬅️',
    holdMs: 1200,
  },
  {
    id: 'blink',
    instruction: 'Blink your eyes naturally',
    icon: '👁️',
    holdMs: 800,
  },
  {
    id: 'smile',
    instruction: 'Give a natural smile',
    icon: '😊',
    holdMs: 800,
  },
] as const;

type GestureId = typeof GESTURE_SEQUENCE[number]['id'];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RegistrationWizardProps {
  onSuccess: () => void;
  currentUser: string;
}

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({ onSuccess, currentUser }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const [gesturePhase, setGesturePhase] = useState<'instruction' | 'countdown' | 'capturing' | 'done'>('instruction');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    let active = true;
    if (step === 2) {
      setErrorMsg("");
      setIsCameraReady(false);

      const video = videoRef.current;
      console.log('[wizard] useEffect fired, videoRef.current:', video);

      if (!video) {
        console.error('[wizard] videoRef.current is NULL — video element not mounted yet');
        setErrorMsg("Internal render error: Video element ref is not bound.");
        return;
      }

      startCamera(video)
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          console.log('[wizard] startCamera resolved');
          streamRef.current = stream;
          setCameraStream(stream);
          return waitForVideoReady(video);
        })
        .then(() => {
          if (active) {
            console.log('[wizard] waitForVideoReady resolved — setting isCameraReady true');
            setIsCameraReady(true);
          }
        })
        .catch((err) => {
          console.error('[wizard] Camera chain failed at:', err.name, err.message);
          if (active) {
            setErrorMsg(err.message || "Camera access denied or failed");
            stopCamera();
          }
        });
    } else {
      stopCamera();
    }

    return () => {
      active = false;
      stopCamera();
    };
  }, [step, cameraRetryCount]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraStream(null);
    }
    setIsCameraReady(false);
  };

  const handleNextStep1 = () => {
    if (!name.trim()) { setErrorMsg("Please enter the employee's full name."); return; }
    if (!empCode.trim()) { setErrorMsg("Please enter a valid employee code."); return; }
    setErrorMsg("");
    setStep(2);
  };

  const runGestureCaptureSequence = useCallback(async () => {
    setIsCapturing(true);
    setFramesCaptured(0);
    setErrorMsg("");

    const frames: string[] = [];

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

        let dataUrl: string | null = null;
        if (cameraStream && videoRef.current && canvasRef.current) {
          dataUrl = await captureWithRetry(videoRef.current, canvasRef.current);
          frames.push(dataUrl);
        } else {
          // Simulator fallback
          await delay(300);
        }
        
        setFramesCaptured(i + 1);
        await delay(400);
      }

      setGesturePhase('done');
      
      if (frames.length > 0) {
        const lastDataUrl = frames[frames.length - 1];
        setCapturedPhoto(lastDataUrl);
      } else {
        setCapturedPhoto(null);
      }

      setIsCapturing(false);
      stopCamera();
      setTimeout(() => setStep(3), 800);
    } catch (err: any) {
      console.error("Frame capture error:", err);
      setErrorMsg(err.message || "Failed to capture frames from camera");
      setIsCapturing(false);
    }
  }, [cameraStream]);

  const handleFinalRegister = () => {
    const key = getOrCreateSecureKey();
    const averagedEmbedding = handleFiveFrameAveraging();
    const encryptedBlob = encryptFaceprint(averagedEmbedding, key);

    const newEmployee: Employee = {
      id: "emp-" + Math.random().toString(36).substr(2, 9),
      name,
      employee_code: empCode.toUpperCase().startsWith("EMP-") ? empCode.toUpperCase() : "EMP-" + empCode,
      faceprint: encryptedBlob,
      registered_at: Date.now(),
      registered_by: currentUser,
      department: department.trim() || undefined,
      designation: designation.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined
    };

    saveEmployee(newEmployee);
    onSuccess();
  };

  const empCodeFormatted = empCode.toUpperCase().startsWith("EMP-") ? empCode.toUpperCase() : "EMP-" + empCode.toUpperCase();

  return (
    <div className="flex-grow flex flex-col justify-between p-4 selection:bg-blue-200">
      {/* Progress Header */}
      <div className="mb-4 animate-fade-in">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold text-slate-800" id="step-title">
            {step === 1 ? "Employee Details" : step === 2 ? "Face Capture" : "Confirmation"}
          </h2>
          <span className="text-[11px] font-bold text-[#414754] bg-slate-100 px-2.5 py-0.5 rounded-full" id="step-indicator">
            Step {step}/3
          </span>
        </div>
        {/* Step indicator dots */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                s <= step ? "bg-gradient-to-r from-[#005bbf] to-[#0ea5e9]" : "bg-slate-200"
              }`}></div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-grow flex flex-col justify-center">
        {/* Step 1 */}
        {step === 1 && (
          <section id="step-1" className="space-y-5 animate-fade-in">
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1.5 custom-scrollbar">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-name">
                  Employee Full Name *
                </label>
                <input
                  id="emp-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter employee's full name"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-code">
                  Employee Code ID *
                </label>
                <input
                  id="emp-code"
                  type="text"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value)}
                  placeholder="e.g. EMP-98122"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs uppercase"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-dept">
                  Department (Optional)
                </label>
                <input
                  id="emp-dept"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Operations Control"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-desg">
                  Designation / Role (Optional)
                </label>
                <input
                  id="emp-desg"
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Field Officer"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-email">
                  Email Address (Optional)
                </label>
                <input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. name@datalake.org"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#414754]" htmlFor="emp-phone">
                  Phone Number (Optional)
                </label>
                <input
                  id="emp-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all text-xs"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-red-500 text-xs font-semibold text-center bg-red-50 p-2 rounded-lg border border-red-100 animate-fade-in">
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleNextStep1}
              className="w-full h-11 btn-primary rounded-full flex items-center justify-center gap-1.5 text-xs font-bold"
            >
              Next Step
              <ArrowRight className="w-4 h-4" />
            </button>
          </section>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <section id="step-2" className="space-y-4 animate-fade-in flex flex-col items-center">
            <div className="relative w-full aspect-[3/3.8] rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-lg flex items-center justify-center">
              
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                  isCameraReady ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {!cameraStream && errorMsg ? (
                <div className="w-full h-full absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center text-center p-4 z-10 animate-fade-in">
                  <div className="w-16 h-16 bg-red-950/50 rounded-full flex items-center justify-center text-red-500 mb-2 border border-red-500/20">
                    <AlertCircle className="w-6 h-6 animate-pulse" />
                  </div>
                  <p className="text-red-400 text-xs font-bold">Camera Initialization Failed</p>
                  <p className="text-slate-400 text-[10px] mt-1 max-w-[220px] leading-normal">{errorMsg}</p>
                  <button
                    onClick={() => {
                      setErrorMsg("");
                      setCameraRetryCount(prev => prev + 1);
                    }}
                    className="mt-3 bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 px-4 py-1.5 rounded-full text-[10px] font-bold active:scale-95 transition-spring cursor-pointer"
                  >
                    Retry Connection
                  </button>
                </div>
              ) : !cameraStream ? (
                <div className="w-full h-full absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center text-center p-4 animate-fade-in">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-500 mb-2">
                    <Camera className="w-6 h-6 animate-pulse" />
                  </div>
                  <p className="text-white text-xs font-medium">Simulator camera mode</p>
                  <p className="text-slate-500 text-[11px] mt-1">Click Capture to proceed</p>
                </div>
              ) : null}

              {/* Gesture UI Overlay */}
              {isCameraReady && gesturePhase !== 'done' && (
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

              {/* Oval guide */}
              <div className="absolute inset-0 bg-black/55 pointer-events-none"
                style={{
                  maskImage: 'radial-gradient(ellipse 42% 52% at 50% 50%, transparent 100%, black 100%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 42% 52% at 50% 50%, transparent 100%, black 100%)'
                }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`w-[60%] h-[72%] border-2 border-dashed rounded-[100%] transition-colors duration-300 ${
                  framesCaptured > 0 ? "border-emerald-400 scan-guide-success" : "border-white/60"
                }`} id="camera-guide"></div>
              </div>

              {/* Frame progress dots at bottom */}
              {isCameraReady && (
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

            </div>

            <canvas ref={canvasRef} width="400" height="500" className="hidden" />

            <p className="text-center text-xs text-[#414754] px-4">
              5 captures are mathematically merged into a single robust embedding.
            </p>

            {errorMsg && (
              <p className="text-red-500 text-xs font-semibold text-center bg-red-50 p-2 rounded-lg border border-red-100 animate-fade-in w-full max-w-xs mx-auto">
                {errorMsg}
              </p>
            )}

            <button
              id="capture-btn"
              onClick={runGestureCaptureSequence}
              disabled={isCapturing || (!!cameraStream && !isCameraReady)}
              className="w-full h-11 btn-primary rounded-full flex items-center justify-center gap-2 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCapturing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  Capturing ({framesCaptured}/5)...
                </>
              ) : !!cameraStream && !isCameraReady ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  Initializing Camera...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Start 5-Frame Capture
                </>
              )}
            </button>
          </section>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <section id="step-3" className="space-y-5 animate-fade-in-scale">
            <div className="glass-card p-5 rounded-2xl space-y-6">
              
              {/* Avatar */}
              <div className="flex justify-center">
                <div className="relative w-28 h-28 rounded-full border-4 border-[#005bbf] p-0.5 shadow-lg animate-pulse-glow bg-slate-800">
                  {capturedPhoto ? (
                    <img
                      id="captured-avatar"
                      alt="Captured Face"
                      src={capturedPhoto}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-800 text-slate-400 p-4 flex items-center justify-center">
                      <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 bg-[#00722f] text-white p-1 rounded-full shadow-md leading-none border-2 border-white">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1 text-center max-h-[140px] overflow-y-auto custom-scrollbar px-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Review Employee Profile
                </p>
                <h3 className="text-lg font-extrabold text-[#181c20]" id="display-name">
                  {name}
                </h3>
                <p className="text-xs text-[#005bbf] font-bold font-mono" id="display-code">
                  {empCodeFormatted}
                </p>
                <div className="pt-2 flex flex-wrap gap-1 justify-center text-[10px]">
                  {department && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{department}</span>
                  )}
                  {designation && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{designation}</span>
                  )}
                  {email && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{email}</span>
                  )}
                  {phone && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{phone}</span>
                  )}
                </div>
              </div>

              {/* Security info */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 card-interactive">
                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-emerald-600" />
                    Sync Status
                  </span>
                  <span className="bg-[#86f898] text-[#00722f] px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Ready
                  </span>
                </div>
                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 card-interactive">
                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#005bbf]" />
                    Embedding
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 font-mono">
                    512-dim L2-norm
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                id="btn-register-confirm"
                onClick={handleFinalRegister}
                className="w-full h-11 btn-primary rounded-full flex items-center justify-center gap-1.5 text-xs font-bold"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm &amp; Encrypt Write
              </button>
              <button
                id="btn-register-restart"
                onClick={() => {
                  setStep(1);
                  setName("");
                  setEmpCode("");
                  setDepartment("");
                  setDesignation("");
                  setEmail("");
                  setPhone("");
                  setFramesCaptured(0);
                  setCapturedPhoto(null);
                }}
                className="w-full h-11 border border-slate-300 text-[#005bbf] text-xs font-bold rounded-full hover:bg-slate-50 transition-spring"
              >
                Start Over
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
