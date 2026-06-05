import React, { useState } from "react";
import { AccessRole } from "../types";
import { User, Shield, Lock, LogIn, CloudOff, ShieldCheck } from "lucide-react";

interface LoginViewProps {
  onLoginSuccess: (role: AccessRole, username: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [role, setRole] = useState<AccessRole>(AccessRole.EMPLOYEE);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg("Please enter a username.");
      return;
    }
    if (password.length < 4) {
      setErrorMsg("Password must be at least 4 characters.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess(role, username);
    }, 1200);
  };

  return (
    <div
      id="login-view"
      className="flex-grow flex flex-col justify-between p-6 bg-[#f7f9ff] animate-fade-in"
    >
      {/* Branding Header */}
      <div className="flex flex-col items-center text-center gap-2 mt-4 animate-fade-in-scale">
        <div className="w-20 h-20 mb-2">
          <div className="w-full h-full bg-gradient-to-br from-[#005bbf] to-[#0047a3] rounded-[20px] flex items-center justify-center shadow-lg shadow-[#005bbf]/20 relative">
            <div className="absolute top-1.5 left-1.5 w-4 h-4 border-t-2 border-l-2 border-white/80"></div>
            <div className="absolute top-1.5 right-1.5 w-4 h-4 border-t-2 border-r-2 border-white/80"></div>
            <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-b-2 border-l-2 border-white/80"></div>
            <div className="absolute bottom-1.5 right-1.5 w-4 h-4 border-b-2 border-r-2 border-white/80"></div>
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-[#181c20] tracking-tight">
          OfflineID
        </h1>
        <p className="text-xs text-[#414754]">
          Secure field operations and identity, even offline.
        </p>
      </div>

      {/* Credentials Form */}
      <form
        onSubmit={handleSubmit}
        className="glass-card p-6 rounded-2xl flex flex-col gap-5 mt-6 animate-fade-in anim-delay-200"
        style={{ animationFillMode: 'both' }}
      >
        {/* Role Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[#414754]">
            Access Role
          </label>
          <div className="flex p-1 bg-slate-100 rounded-lg h-12">
            <button
              id="role-employee"
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md transition-spring text-xs font-semibold ${
                role === AccessRole.EMPLOYEE
                  ? "bg-white text-[#005bbf] shadow-sm"
                  : "text-[#414754] hover:bg-slate-200"
              }`}
              onClick={() => setRole(AccessRole.EMPLOYEE)}
            >
              <User className="w-4 h-4" />
              Employee
            </button>
            <button
              id="role-admin"
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md transition-spring text-xs font-semibold ${
                role === AccessRole.ADMIN
                  ? "bg-white text-[#005bbf] shadow-sm"
                  : "text-[#414754] hover:bg-slate-200"
              }`}
              onClick={() => setRole(AccessRole.ADMIN)}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-xs font-semibold text-[#414754]">
              Username
            </label>
            <div className="relative group">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#005bbf] transition-colors">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={role === AccessRole.ADMIN ? "Enter admin code" : "e.g. John Doe, EMP-0814"}
                disabled={isLoading}
                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-300 rounded-lg focus:border-[#005bbf] focus:ring-1 focus:ring-[#005bbf] outline-none transition-all placeholder:text-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-xs font-semibold text-[#414754]">
              Secure Password
            </label>
            <div className="relative group">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#005bbf] transition-colors">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-300 rounded-lg focus:border-[#005bbf] focus:ring-1 focus:ring-[#005bbf] outline-none transition-all placeholder:text-slate-300 text-sm"
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <p className="text-red-600 text-xs font-semibold text-center bg-red-50 p-2 rounded-lg border border-red-100 animate-fade-in">
            {errorMsg}
          </p>
        )}

        <button
          id="btn-login-submit"
          type="submit"
          disabled={isLoading}
          className="w-full h-11 btn-primary rounded-lg text-xs font-bold flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
              Decrypting Database...
            </>
          ) : (
            <>
              Login
              <LogIn className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Offline badge */}
      <div className="flex items-center justify-center py-2 mt-4 animate-fade-in anim-delay-400" style={{ animationFillMode: 'both' }}>
        <div className="flex items-center gap-1.5 bg-[#ffdfa0] text-[#5c4300] px-3.5 py-1.5 rounded-full border border-[#987000]/40 shadow-sm">
          <CloudOff className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Local Storage Active
          </span>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 flex flex-col items-center gap-1.5">
        <p className="text-[11px] font-bold text-slate-400">
          v2.4.0-STABLE
        </p>
        <div className="flex items-center gap-1 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">
            Fully Encrypt-On-Write Storage
          </span>
        </div>
      </footer>
    </div>
  );
};
