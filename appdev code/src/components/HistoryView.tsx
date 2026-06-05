import React, { useState, useEffect } from "react";
import { AttendanceLog } from "../types";
import { getAttendanceLogs } from "../database/db";
import { Search, Calendar, CheckSquare, Clock, Filter } from "lucide-react";

interface HistoryViewProps {
  logsVersion: number;
}

const GESTURE_ICONS: Record<string, string> = {
  "Blink": "👁️",
  "Smile": "😊",
  "Head Turn": "↩️",
  "Turn left": "⬅️",
  "Turn right": "➡️",
};

export const HistoryView: React.FC<HistoryViewProps> = ({ logsVersion }) => {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "synced" | "pending">("all");

  useEffect(() => {
    setLogs(getAttendanceLogs());
  }, [logsVersion]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.employee_code.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "synced" && log.synced === 1) ||
      (activeFilter === "pending" && log.synced === 0);

    let matchesDate = true;
    if (selectedDate) {
      const logDate = new Date(log.timestamp).toISOString().split("T")[0];
      matchesDate = logDate === selectedDate;
    }

    return matchesSearch && matchesFilter && matchesDate;
  });

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const getDayHeader = (timestamp: number) => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toDateString();
    const logDay = new Date(timestamp).toDateString();
    if (logDay === today) return "Today";
    if (logDay === yesterday) return "Yesterday";
    return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const groupedLogs: { [key: string]: AttendanceLog[] } = {};
  filteredLogs.forEach((log) => {
    const header = getDayHeader(log.timestamp);
    if (!groupedLogs[header]) groupedLogs[header] = [];
    groupedLogs[header].push(log);
  });

  const filters = [
    { id: "all" as const, label: "All Logs", icon: null },
    { id: "synced" as const, label: "Synced", icon: CheckSquare },
    { id: "pending" as const, label: "Pending", icon: Clock },
  ];

  return (
    <div className="flex-grow flex flex-col justify-stretch bg-[#f7f9ff] h-full selection:bg-blue-100 animate-fade-in">
      
      {/* Filters */}
      <section className="p-4 space-y-3 bg-white/90 backdrop-blur-sm border-b border-[#c1c6d6]/60">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name..."
              className="w-full h-10 pl-10 pr-4 border border-slate-200 rounded-lg bg-[#f7f9ff] text-sm focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border border-slate-200 rounded-lg bg-[#f7f9ff] text-sm focus:ring-1 focus:ring-[#005bbf] focus:border-[#005bbf] outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {filters.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-4 h-8 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1 transition-spring ${
                  activeFilter === f.id
                    ? "bg-[#86f898] text-[#002108] shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Logs List */}
      <main className="flex-1 overflow-y-auto px-4 pb-24 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-2">
              <Filter className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-semibold">No attendance matches found</p>
            <p className="text-[11px] text-slate-400">Clear search or date filter and retry.</p>
          </div>
        ) : (
          Object.keys(groupedLogs).map((dateHeader) => (
            <div key={dateHeader} className="mt-4 animate-fade-in">
              <div className="py-1 bg-[#f7f9ff] sticky top-0 z-10 mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {dateHeader}
                </p>
              </div>

              <div className="space-y-2">
                {groupedLogs[dateHeader].map((log, idx) => (
                  <div
                    key={log.id}
                    className="bg-white border border-slate-200/80 p-3 rounded-xl flex items-center gap-3 card-interactive shadow-sm"
                    style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
                  >
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#005bbf] to-[#0047a3] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative shadow-sm">
                      {log.employee_name.charAt(0)}
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 border-white ${
                          log.synced === 1 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      >
                        <CheckSquare className="w-2 h-2 text-white" />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-xs truncate text-slate-800 leading-tight">
                          {log.employee_name}
                        </h3>
                        <span
                          className={`font-bold text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                            log.synced === 1
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}
                        >
                          {log.synced === 1 ? "SYNCED" : "PENDING"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {log.employee_code} • {formatTime(log.timestamp)}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 font-bold text-[9px] text-[#00722f]">
                          ✅ {(log.confidence * 100).toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-[9px] text-slate-500">
                          {GESTURE_ICONS[log.gesture_used] || "👁️"} {log.gesture_used}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};
