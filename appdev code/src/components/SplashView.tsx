import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

interface SplashViewProps {
  onLoaded: () => void;
}

const LOADING_STAGES = [
  { progress: 15, text: "Initializing secure system...", delay: 0 },
  { progress: 40, text: "Loading ONNX neural engines...", delay: 800 },
  { progress: 65, text: "Decrypting SQLCipher database...", delay: 1600 },
  { progress: 88, text: "Verifying AES-256 keychain...", delay: 2200 },
  { progress: 100, text: "System ready.", delay: 2800 },
];

export const SplashView: React.FC<SplashViewProps> = ({ onLoaded }) => {
  const [progress, setProgress] = useState(15);
  const [statusText, setStatusText] = useState("Initializing secure system...");

  useEffect(() => {
    const timers = LOADING_STAGES.map((stage) =>
      setTimeout(() => {
        setProgress(stage.progress);
        setStatusText(stage.text);
      }, stage.delay)
    );

    const finalTimer = setTimeout(() => onLoaded(), 3300);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finalTimer);
    };
  }, [onLoaded]);

  return (
    <div
      id="splash-screen"
      className="flex-1 flex flex-col justify-between overflow-hidden bg-[#f7f9ff] text-[#181c20] h-full p-6"
    >
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {/* App Logo with scan animation */}
        <div className="relative w-48 h-48 flex items-center justify-center mb-6 animate-fade-in-scale">
          {/* Outer glow ring */}
          <div className="absolute inset-4 rounded-[28px] bg-[#005bbf]/10 animate-pulse-glow"></div>
          
          <div className="w-36 h-36 bg-gradient-to-br from-[#005bbf] to-[#0047a3] rounded-[24px] flex items-center justify-center shadow-lg shadow-[#005bbf]/25 relative">
            {/* Scanner corners */}
            <div className="absolute top-2 left-2 w-6 h-6 border-t-[3px] border-l-[3px] border-white/90 rounded-tl-sm"></div>
            <div className="absolute top-2 right-2 w-6 h-6 border-t-[3px] border-r-[3px] border-white/90 rounded-tr-sm"></div>
            <div className="absolute bottom-2 left-2 w-6 h-6 border-b-[3px] border-l-[3px] border-white/90 rounded-bl-sm"></div>
            <div className="absolute bottom-2 right-2 w-6 h-6 border-b-[3px] border-r-[3px] border-white/90 rounded-br-sm"></div>
            
            {/* Scan line effect */}
            <div className="absolute inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-white/70 to-transparent animate-scan-line"></div>
            
            {/* Face icon */}
            <div className="w-16 h-16 border-[3px] border-white rounded-full flex flex-col items-center justify-center relative z-10">
              <div className="w-4 h-4 bg-white rounded-full mb-1"></div>
              <div className="w-10 h-6 border-t-[3px] border-white rounded-t-full"></div>
            </div>
          </div>
        </div>

        {/* Brand */}
        <h1 className="text-3xl font-extrabold tracking-tight gradient-text animate-fade-in anim-delay-200" style={{ animationFillMode: 'both' }}>
          OfflineID
        </h1>
        <p className="text-sm text-[#414754] mt-2 opacity-60 text-center animate-fade-in anim-delay-300" style={{ animationFillMode: 'both' }}>
          Secure Field Identity &amp; Attendance
        </p>

        {/* Model info badges */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-5 animate-fade-in anim-delay-400" style={{ animationFillMode: 'both' }}>
          {["SCRFD-500M", "FASNet v1/v2", "MobileFaceNet", "AES-256"].map((model) => (
            <span
              key={model}
              className="px-2.5 py-0.5 bg-[#005bbf]/8 text-[#005bbf] text-[9px] font-bold rounded-full border border-[#005bbf]/15 uppercase tracking-wider"
            >
              {model}
            </span>
          ))}
        </div>
      </main>

      {/* Loading footer */}
      <footer className="w-full max-w-sm mx-auto px-4 pb-8 flex flex-col items-center animate-fade-in anim-delay-300" style={{ animationFillMode: 'both' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 border-2 border-[#005bbf] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-[#414754]">
            {statusText}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-[6px] bg-slate-200 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-[#005bbf] to-[#0ea5e9] transition-all duration-500 ease-out rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            {progress < 100 && (
              <div className="absolute inset-0 animate-progress-stripe opacity-30"></div>
            )}
          </div>
        </div>

        {/* Version + security badge */}
        <div className="flex items-center gap-3 mt-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            v2.4.0-stable
          </p>
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <div className="flex items-center gap-1 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">On-Device Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
