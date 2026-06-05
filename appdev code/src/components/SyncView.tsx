import React, { useState, useEffect } from "react";
import { getAttendanceLogs, updateAttendanceLogSyncStatus } from "../database/db";
import { Cloud, CloudOff, RefreshCw, Smartphone, Database, CheckSquare, Clock } from "lucide-react";

interface SyncViewProps {
  logsVersion: number;
  onSyncTriggered: () => void;
  networkStatus: "online" | "offline";
  setNetworkStatus: (status: "online" | "offline") => void;
}

export const SyncView: React.FC<SyncViewProps> = ({
  logsVersion,
  onSyncTriggered,
  networkStatus,
  setNetworkStatus
}) => {
  const [logs, setLogs] = useState(getAttendanceLogs());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPercentage, setSyncPercentage] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>("5 mins ago");

  useEffect(() => {
    setLogs(getAttendanceLogs());
  }, [logsVersion]);

  const totalLogs = logs.length;
  const syncedLogs = logs.filter((l) => l.synced === 1).length;
  const pendingLogs = logs.filter((l) => l.synced === 0).length;
  const actualPercentage = totalLogs > 0 ? Math.round((syncedLogs / totalLogs) * 100) : 100;

  const handleSyncInit = () => {
    if (isSyncing) return;

    if (networkStatus === "offline") {
      alert("Sync Failed: Device is in zero-network zone. Toggle to SIM-ONLINE first.");
      return;
    }

    setIsSyncing(true);
    setSyncPercentage(0);

    let current = 0;
    const interval = setInterval(() => {
      current += 4;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        
        const pendingIds = logs.filter((l) => l.synced === 0).map((l) => l.id);
        updateAttendanceLogSyncStatus(pendingIds, 1, 1);
        
        setTimeout(() => {
          setIsSyncing(false);
          setLastSyncTime("Just now");
          onSyncTriggered();
        }, 500);
      }
      setSyncPercentage(current);
    }, 85);
  };

  const displayPercent = isSyncing ? syncPercentage : actualPercentage;
  const circumference = 2 * Math.PI * 95; // ~597
  const strokeDashoffset = circumference - (displayPercent / 100) * circumference;

  return (
    <div className="flex-grow flex flex-col justify-between bg-[#f7f9ff] h-full p-4 selection:bg-blue-100 animate-fade-in">
      
      {/* Network Toggle */}
      <section className="flex flex-col items-center justify-center gap-3">
        <div className="flex bg-slate-200 p-1 rounded-full w-full justify-between max-w-[280px] h-10 border border-slate-300/60">
          <button
            onClick={() => setNetworkStatus("online")}
            className={`flex-1 rounded-full text-[10px] font-bold flex items-center justify-center gap-1.5 transition-spring ${
              networkStatus === "online"
                ? "bg-[#86f898] text-[#002108] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            SIM-ONLINE
          </button>
          <button
            onClick={() => setNetworkStatus("offline")}
            className={`flex-grow rounded-full text-[10px] font-bold flex items-center justify-center gap-1.5 transition-spring ${
              networkStatus === "offline"
                ? "bg-[#ffdfa0] text-[#5c4300] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <CloudOff className="w-3.5 h-3.5" />
            OFFLINE
          </button>
        </div>

        {/* Circular Progress */}
        <div className="relative w-52 h-52 mt-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 224 224">
            <circle
              cx="112"
              cy="112"
              r="95"
              fill="transparent"
              stroke="#e2e8f0"
              strokeWidth="10"
            />
            <circle
              cx="112"
              cy="112"
              r="95"
              fill="transparent"
              stroke="url(#syncGradient)"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            <defs>
              <linearGradient id="syncGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#005bbf" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-extrabold gradient-text">
              {displayPercent}%
            </span>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-0.5">
              {isSyncing ? "SYNCING..." : "SYNCED"}
            </span>
            {isSyncing && (
              <div className="w-4 h-4 border-2 border-[#005bbf]/30 border-t-[#005bbf] rounded-full animate-spin mt-2"></div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Smartphone className="w-3.5 h-3.5" />
          Last sync: {lastSyncTime}
        </p>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 gap-3 mt-6">
        <div className="col-span-2 glass-card p-4 rounded-xl flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-400 font-semibold mb-0.5">Total SQLite Logs</p>
            <p className="text-2xl font-black text-slate-800">{totalLogs}</p>
          </div>
          <div className="p-2.5 bg-[#005bbf]/8 rounded-xl text-[#005bbf]">
            <Database className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center gap-1 mb-1">
            <CheckSquare className="w-4 h-4 text-emerald-600" />
            <p className="text-xs text-slate-400 font-semibold">Synced</p>
          </div>
          <p className="text-xl font-bold text-slate-800">{syncedLogs}</p>
        </div>

        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-slate-400 font-semibold">Pending</p>
          </div>
          <p className="text-xl font-bold text-slate-800">{pendingLogs}</p>
        </div>
      </section>

      {/* Sync Button */}
      <section className="mt-6 flex flex-col gap-2">
        <button
          id="btn-sync-trigger"
          disabled={isSyncing}
          onClick={handleSyncInit}
          className="w-full h-11 btn-primary rounded-xl flex items-center justify-center gap-2 text-xs font-bold disabled:opacity-60"
        >
          {isSyncing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
              Syncing log batch...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Simulate Sync Now
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-[#414754] italic">
          Logs are encrypted with AES-256 local key until cloud ingestion.
        </p>
      </section>
    </div>
  );
};
