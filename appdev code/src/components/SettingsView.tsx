import React, { useState } from "react";
import { getOrCreateSecureKey, purgeOldLogs, getEmployees } from "../database/db";
import { MODEL_METADATA } from "../ml/pipeline";
import { ShieldCheck, Key, Trash2, Cpu, Users, LogOut } from "lucide-react";

interface SettingsViewProps {
  onCacheReset: () => void;
  currentUser: string;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onCacheReset, currentUser, onLogout }) => {
  const secureKey = getOrCreateSecureKey();
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const employees = getEmployees();

  const runPurgeMock = () => {
    const purgesNum = purgeOldLogs();
    setPurgeResult(`Purge completed. Hard-deleted ${purgesNum} synced records older than 24 hours.`);
    onCacheReset();
    setTimeout(() => setPurgeResult(null), 3000);
  };

  const resetAllLocalContent = () => {
    if (confirm("Reset all local data? Enrolled faces and logs will be restored to demo defaults.")) {
      localStorage.clear();
      onCacheReset();
      window.location.reload();
    }
  };

  return (
    <div className="flex-grow flex flex-col justify-stretch bg-[#f7f9ff] h-full p-4 overflow-y-auto pb-24 selection:bg-blue-100 animate-fade-in custom-scrollbar">
      
      {/* 1. Account Session */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" />
          Active Account
        </h3>
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div>
            <p className="text-xs font-bold text-slate-800">{currentUser}</p>
            <p className="text-[10px] text-slate-500">Admin Group • Full Access</p>
          </div>
          <button
            onClick={onLogout}
            className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full text-[10px] font-bold active:scale-95 transition-spring flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </section>

      {/* 2. Enrolled Employees */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          Enrolled Employees ({employees.length})
        </h3>
        <div className="space-y-1.5">
          {employees.slice(0, 5).map((emp) => (
            <div key={emp.id} className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#005bbf] to-[#0047a3] flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
                {emp.name.charAt(0)}
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{emp.name}</p>
                <p className="text-[9px] text-slate-500 font-mono">{emp.employee_code}</p>
              </div>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex-shrink-0">
                ACTIVE
              </span>
            </div>
          ))}
          {employees.length > 5 && (
            <p className="text-[10px] text-slate-400 text-center font-semibold">
              +{employees.length - 5} more enrolled
            </p>
          )}
        </div>
      </section>

      {/* 3. ONNX Models */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <Cpu className="w-4 h-4" />
          Neural Engine Status
        </h3>
        <div className="space-y-2">
          {Object.entries(MODEL_METADATA).map(([key, meta]) => (
            <div key={key} className="bg-slate-50 p-2.5 rounded-xl flex justify-between items-center text-[11px] border border-slate-100 card-interactive">
              <div>
                <p className="font-bold text-slate-800">{meta.name}</p>
                <p className="text-[10px] text-slate-500">{meta.purpose}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-slate-700">{meta.size}</p>
                <p className="text-emerald-600 font-mono text-[9px] font-bold">{meta.latency}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <span className="status-dot status-dot-green"></span>
          <span className="text-[10px] font-semibold text-slate-500">All models loaded • 9.9 MB total</span>
        </div>
      </section>

      {/* 4. AES Key */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <Key className="w-4 h-4" />
          Encryption Keys
        </h3>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-[9px] break-all leading-relaxed text-slate-600">
          <p className="font-bold text-slate-700 mb-1 flex items-center gap-1">
            <span className="status-dot status-dot-green"></span>
            AES-256-GCM SESSION KEY:
          </p>
          <span className="select-all">{secureKey}</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-normal">
          Key is loaded from Keystore / Secure Enclave. Raw biometric data is never stored on disk.
        </p>
      </section>

      {/* 5. Purge */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <Trash2 className="w-4 h-4" />
          Storage Purge Manager
        </h3>
        <p className="text-[10px] text-slate-500 leading-normal">
          Rows with <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-600 text-[9px]">purged = 1</code> older than 24 hours are hard-deleted.
        </p>

        {purgeResult && (
          <p className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg text-[11px] font-semibold border border-emerald-100 animate-fade-in">
            ✅ {purgeResult}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={runPurgeMock}
            className="flex-1 h-10 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold transition-spring active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Trigger Purge
          </button>
          <button
            onClick={resetAllLocalContent}
            className="px-3.5 h-10 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl text-xs font-bold transition-spring active:scale-95 flex items-center justify-center"
            title="Reset storage to demo defaults"
          >
            Reset DB
          </button>
        </div>
      </section>
    </div>
  );
};
