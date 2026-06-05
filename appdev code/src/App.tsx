import React, { useState, useEffect } from "react";
import { AccessRole, AttendanceLog } from "./types";
import { initializeStorage } from "./database/db";

// Modular View Imports
import { SplashView } from "./components/SplashView";
import { LoginView } from "./components/LoginView";
import { RegistrationWizard } from "./components/RegistrationWizard";
import { ActiveScanView } from "./components/ActiveScanView";
import { HistoryView } from "./components/HistoryView";
import { SyncView } from "./components/SyncView";
import { SettingsView } from "./components/SettingsView";

// Icon imports
import { Scan, History, RefreshCw, Settings, UserPlus, Signal, Wifi, Battery, ShieldCheck } from "lucide-react";

export default function App() {
  const [appState, setAppState] = useState<"splash" | "login" | "main">("splash");
  const [currentRole, setCurrentRole] = useState<AccessRole>(AccessRole.EMPLOYEE);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<"scan" | "history" | "sync" | "settings">("scan");
  
  const [dbVersion, setDbVersion] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<"online" | "offline">("offline");

  const [localTime, setLocalTime] = useState("");

  useEffect(() => {
    initializeStorage();
    setDbVersion((v) => v + 1);

    const updateTime = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSplashEnd = () => {
    setAppState("login");
  };

  const handleLoginSuccess = (role: AccessRole, username: string) => {
    setCurrentRole(role);
    setCurrentUser(username);
    setAppState("main");
    if (role === AccessRole.EMPLOYEE) {
      setActiveTab("scan");
    } else {
      setActiveTab("history");
    }
  };

  const reloadDatabaseStates = () => {
    setDbVersion((v) => v + 1);
  };

  const handleLogout = () => {
    setAppState("login");
    setCurrentUser(null);
    setIsRegistering(false);
  };

  const tabs = [
    { id: "scan" as const, label: "Scan", icon: Scan, restricted: false },
    { id: "history" as const, label: "History", icon: History, restricted: false },
    { id: "sync" as const, label: "Sync", icon: RefreshCw, restricted: true },
    { id: "settings" as const, label: "Settings", icon: Settings, restricted: true },
  ];

  return (
    <div className="w-full min-h-screen flex items-center justify-center py-6 px-4">
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#f7f9ff] rounded-[44px] border-[10px] border-slate-900 phone-frame flex flex-col overflow-hidden text-[#181c20] phone-container">
        
        {/* ── Smartphone Notch & Status Bar ──────────────────────────── */}
        <div className="sticky top-0 bg-[#f7f9ff] z-50 text-slate-800">
          <div className="w-28 h-5 bg-slate-900 mx-auto rounded-b-2xl flex items-center justify-center">
            <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
          </div>
          
          <div className="px-5 py-1.5 flex justify-between items-center text-[11px] font-bold text-slate-700 select-none">
            <span>{localTime}</span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <Battery className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* ── Screen Content ─────────────────────────────────────────── */}
        {appState === "splash" && (
          <SplashView onLoaded={handleSplashEnd} />
        )}

        {appState === "login" && (
          <LoginView onLoginSuccess={handleLoginSuccess} />
        )}

        {appState === "main" && (
          <div className="flex-grow flex flex-col justify-stretch h-full">
            
            {/* App Bar */}
            <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-[#c1c6d6]/60 flex justify-between items-center px-4 h-12 z-20">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#005bbf] animate-breathe"></span>
                <span className="font-bold text-sm tracking-tight text-[#005bbf]">
                  OfflineID {!isRegistering ? `• ${activeTab.toUpperCase()}` : "• REGISTER"}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {currentRole === AccessRole.ADMIN && !isRegistering && (
                  <button
                    id="header-shortcut-register"
                    onClick={() => setIsRegistering(true)}
                    className="btn-primary px-2.5 py-1 text-[10px] font-extrabold rounded-full flex items-center gap-1"
                    title="Enrol new employee credentials"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    ENROL
                  </button>
                )}
                {isRegistering && (
                  <button
                    id="header-shortcut-cancel-register"
                    onClick={() => setIsRegistering(false)}
                    className="border border-slate-300 text-slate-600 px-2.5 py-1 text-[10px] font-bold rounded-full active:scale-95 transition-spring"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </header>

            {/* Active Content */}
            <div className="flex-grow flex flex-col justify-stretch overflow-hidden">
              {isRegistering ? (
                <RegistrationWizard
                  currentUser={currentUser || "Admin"}
                  onSuccess={() => {
                    setIsRegistering(false);
                    reloadDatabaseStates();
                    setActiveTab("history");
                  }}
                />
              ) : (
                <>
                  {activeTab === "scan" && (
                    <ActiveScanView
                      onSuccess={() => {
                        reloadDatabaseStates();
                        setActiveTab("history");
                      }}
                    />
                  )}

                  {activeTab === "history" && (
                    <HistoryView logsVersion={dbVersion} />
                  )}

                  {activeTab === "sync" && (
                    <SyncView
                      logsVersion={dbVersion}
                      onSyncTriggered={reloadDatabaseStates}
                      networkStatus={networkStatus}
                      setNetworkStatus={setNetworkStatus}
                    />
                  )}

                  {activeTab === "settings" && (
                    <SettingsView
                      currentUser={currentUser || "Admin"}
                      onCacheReset={reloadDatabaseStates}
                      onLogout={handleLogout}
                    />
                  )}
                </>
              )}
            </div>

            {/* ── Bottom Navigation ──────────────────────────────────── */}
            {!isRegistering && (
              <nav className="sticky bottom-0 left-0 w-full flex justify-around items-center py-2 px-3 bg-white/95 backdrop-blur-md border-t border-[#c1c6d6]/60 z-40 select-none pb-4">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const isDisabled = tab.restricted && currentRole === AccessRole.EMPLOYEE;
                  
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      onClick={() => {
                        if (isDisabled) {
                          alert(`Permission Denied: ${tab.label} can only be accessed by authorized Admins.`);
                          return;
                        }
                        setActiveTab(tab.id);
                      }}
                      className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-spring relative ${
                        isDisabled ? "opacity-30" : ""
                      } ${
                        isActive
                          ? "text-[#005bbf]"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      title={isDisabled ? "Admin access required" : tab.label}
                    >
                      <Icon className={`w-5 h-5 mb-0.5 ${isActive ? "drop-shadow-sm" : ""}`} />
                      <span className="text-[10px] font-bold">{tab.label}</span>
                      {isActive && (
                        <span className="absolute bottom-0 w-4 h-[2.5px] bg-[#005bbf] rounded-full transition-spring"></span>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
