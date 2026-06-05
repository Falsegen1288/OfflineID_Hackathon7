import React, { useState } from "react";
import { getOrCreateSecureKey, purgeOldLogs, getEmployees } from "../database/db";
import { MODEL_METADATA } from "../ml/pipeline";
import { ShieldCheck, Key, Trash2, Cpu, Users, LogOut, Mail, Phone, Calendar, Building, X, User } from "lucide-react";
import { Employee } from "../types";

interface SettingsViewProps {
  onCacheReset: () => void;
  currentUser: string;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onCacheReset, currentUser, onLogout }) => {
  const secureKey = getOrCreateSecureKey();
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
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

      {/* 2. Enrolled Employees (Roster Memory System) */}
      <section className="glass-card rounded-2xl p-4 mb-3 space-y-3">
        <h3 className="font-bold text-xs text-[#005bbf] uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          Enrolled Employees ({employees.length})
        </h3>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
          {(showAll ? employees : employees.slice(0, 5)).map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmp(emp)}
              className="w-full text-left flex items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-[#005bbf]/30 hover:bg-[#005bbf]/5 transition-spring active:scale-[0.98] cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#005bbf] to-[#0047a3] flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{emp.name}</p>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[9px] text-slate-500 font-mono font-bold">{emp.employee_code}</span>
                  {emp.department && (
                    <span className="text-[8px] bg-slate-200 text-slate-600 px-1 rounded truncate max-w-[80px]">
                      {emp.department}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex-shrink-0">
                ACTIVE
              </span>
            </button>
          ))}
        </div>
        {employees.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-center text-[10px] font-bold text-[#005bbf] hover:underline py-1 mt-1 border-t border-slate-100"
          >
            {showAll ? "Show Less Enrolled" : `+${employees.length - 5} More Enrolled (View All)`}
          </button>
        )}
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

      {/* Employee Detail Modal overlay */}
      {selectedEmp && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card w-[340px] rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-fade-in-scale relative max-h-[700px] overflow-y-auto custom-scrollbar border border-white/20">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedEmp(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-full transition-spring"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Profile Card Header */}
            <div className="flex flex-col items-center text-center mt-2 pb-3 border-b border-slate-100">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#005bbf] to-[#0047a3] flex items-center justify-center text-white font-extrabold text-2xl shadow-md mb-2">
                {selectedEmp.name.charAt(0).toUpperCase()}
              </div>
              <h4 className="text-base font-extrabold text-slate-800">{selectedEmp.name}</h4>
              <span className="text-xs font-bold text-[#005bbf] font-mono mt-0.5">{selectedEmp.employee_code}</span>
            </div>

            {/* Metadata section (Memory system fields) */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-bold text-[#005bbf] uppercase tracking-wider">Employee Metadata</h5>
              
              <div className="grid grid-cols-1 gap-2">
                
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <Building className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Department</p>
                    <p className="text-xs font-bold text-slate-700">{selectedEmp.department || "Not Configured"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <User className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Designation / Role</p>
                    <p className="text-xs font-bold text-slate-700">{selectedEmp.designation || "Not Configured"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Email Address</p>
                    <p className="text-xs font-bold text-slate-700 font-mono break-all">{selectedEmp.email || "Not Configured"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Phone Number</p>
                    <p className="text-xs font-bold text-slate-700 font-mono">{selectedEmp.phone || "Not Configured"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Registration Info</p>
                    <p className="text-xs font-bold text-slate-700 leading-normal">
                      Registered: {new Date(selectedEmp.registered_at).toLocaleString()}<br/>
                      By: {selectedEmp.registered_by}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Encrypted Faceprint Details */}
            <div className="space-y-2 pt-1">
              <h5 className="text-[10px] font-bold text-[#005bbf] uppercase tracking-wider flex items-center gap-1">
                <span className="status-dot status-dot-green"></span>
                Biometric Data (AES-256 Encrypted)
              </h5>
              <div className="bg-slate-900 text-slate-400 p-2.5 rounded-xl border border-slate-950 font-mono text-[8px] break-all leading-normal max-h-[70px] overflow-y-auto">
                {selectedEmp.faceprint ? selectedEmp.faceprint : "No Faceprint Blob"}
              </div>
              <p className="text-[9px] text-slate-400 leading-snug">
                Raw face embeddings are vector-normalized and encrypted on-write using the local security keychain.
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
