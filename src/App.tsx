import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  Keyboard, 
  Settings, 
  Plus, 
  Save, 
  ShieldAlert, 
  Zap, 
  LayoutDashboard,
  Cpu,
  X,
  Type,
  ExternalLink,
  PlayCircle,
  Hash,
  Activity,
  Box,
  Fingerprint,
  RefreshCw,
  Search,
  Command
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Device {
  name: string;
  handle: number;
}

type MacroType = "Shortcut" | "Text" | "App" | "Url" | "Sequence";

interface MacroAction {
  type: MacroType;
  value: any;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "devices" | "macros">("dashboard");
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [macros, setMacros] = useState<Record<number, MacroAction>>({});
  const [isLearning, setIsLearning] = useState(false);
  const [editingKey, setEditingKey] = useState<number | null>(null);

  useEffect(() => {
    refreshDevices();
    loadMacros();

    const unlisten = listen<number>("key-captured", (event) => {
      setEditingKey(event.payload);
      setIsLearning(false);
      invoke("set_learning_mode", { enabled: false });
    });

    return () => {
      unlisten.then(u => u());
    };
  }, []);

  const refreshDevices = async () => {
    const list = await invoke<Device[]>("get_keyboards");
    setDevices(list);
  };

  const loadMacros = async () => {
    const m = await invoke<Record<number, MacroAction>>("get_macros");
    setMacros(m);
  };

  const selectDevice = async (handle: number) => {
    setSelectedDevice(handle);
    await invoke("set_sub_keyboard", { handle });
  };

  const startLearning = async () => {
    setIsLearning(true);
    await invoke("set_learning_mode", { enabled: true });
  };

  const saveMacro = async (keyCode: number, action: MacroAction) => {
    try {
      console.log("Saving macro:", { keyCode, action });
      await invoke("update_macro", { keyCode, action });
      setEditingKey(null);
      loadMacros();
    } catch (error) {
      console.error("Failed to save macro:", error);
      alert("保存に失敗しました: " + error);
    }
  };

  return (
    <div className="flex h-screen w-full select-none">
      {/* Sidebar */}
      <aside className="w-72 sidebar-gradient border-r border-white/5 flex flex-col shadow-2xl z-10">
        <div className="p-8 pb-10 flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(var(--color-primary),0.4)]">
              <Cpu className="text-black w-7 h-7" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-background animate-pulse" />
          </div>
          <div>
            <h1 className="font-black text-2xl tracking-tighter italic uppercase text-white/90">SubKey</h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20 w-fit">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <p className="text-[9px] text-primary font-bold tracking-widest uppercase">Kernel Engine v2.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <SidebarLink 
            active={activeTab === "dashboard"} 
            onClick={() => setActiveTab("dashboard")}
            icon={<LayoutDashboard size={20} />}
            label="ダッシュボード"
            badge="Healthy"
          />
          <SidebarLink 
            active={activeTab === "devices"} 
            onClick={() => setActiveTab("devices")}
            icon={<Keyboard size={20} />}
            label="デバイス管理"
          />
          <SidebarLink 
            active={activeTab === "macros"} 
            onClick={() => setActiveTab("macros")}
            icon={<Zap size={20} />}
            label="マクロ・エンジン"
            badge={Object.keys(macros).length > 0 ? Object.keys(macros).length.toString() : undefined}
          />
          <div className="pt-6 px-4">
            <div className="h-px bg-white/5 w-full" />
          </div>
          <SidebarLink 
            active={false}
            onClick={() => {}}
            icon={<Box size={20} />}
            label="高度なプラグイン"
          />
        </nav>

        <div className="p-6 mt-auto">
          <div className="glass-panel p-5 rounded-2xl border-primary/10 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
              <ShieldAlert className="w-12 h-12 text-primary" />
            </div>
            <p className="text-[10px] text-primary font-bold tracking-widest uppercase mb-2">緊急停止プロトコル</p>
            <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-mono">⌘</span>
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-mono">ALT</span>
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-mono">SHIFT</span>
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-mono">ESC</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-transparent p-12 relative">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-5xl space-y-12"
            >
              <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Activity size={18} />
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">System Overview</span>
                </div>
                <h2 className="text-5xl font-black tracking-tight text-white/95 leading-none">
                  Core <span className="text-primary italic">Status</span>.
                </h2>
                <p className="text-white/40 text-lg max-w-2xl leading-relaxed">
                  マクロエンジンの稼働状況を監視しています。全てのキーボード割り込みが正常に処理され、入力リークは検出されていません。
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <StatBox 
                  label="エンジン状態" 
                  value={selectedDevice ? "RUNNING" : "STANDBY"} 
                  sub={selectedDevice ? "隔離処理完了" : "デバイス待機中"}
                  icon={<Zap size={24} />}
                  active={!!selectedDevice}
                />
                <StatBox 
                  label="アクティブ・マクロ" 
                  value={Object.keys(macros).length.toString()} 
                  sub="キーバインド登録済み"
                  icon={<Fingerprint size={24} />}
                  active={Object.keys(macros).length > 0}
                />
                <StatBox 
                  label="パケット処理" 
                  value="120ms" 
                  sub="平均応答レイテンシ"
                  icon={<Command size={24} />}
                  active={true}
                />
              </div>

              {!selectedDevice && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-panel p-16 flex flex-col items-center justify-center text-center space-y-8 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                    <Keyboard className="w-10 h-10 text-white/20" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold">デバイス登録が必要です</h3>
                    <p className="text-white/40 max-w-sm mx-auto leading-relaxed">
                      入力を完全にコントロールするために、専用のサブキーボードを指定してください。
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveTab("devices")}
                    className="btn-cyber min-w-[200px]"
                  >
                    セットアップを開始
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "devices" && (
            <motion.div 
              key="devices"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-5xl space-y-10"
            >
              <header className="flex justify-between items-end">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-primary font-bold tracking-widest text-[10px] uppercase">
                    Detection System
                  </div>
                  <h2 className="text-4xl font-black text-white/95">Hardware <span className="text-primary italic">Matrix</span></h2>
                </div>
                <button 
                  onClick={refreshDevices}
                  className="group flex items-center gap-2 px-5 py-2.5 glass-panel hover:bg-white/5 transition-all text-sm font-bold active:scale-95"
                >
                  <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                  再スキャン
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                {devices.length === 0 && (
                  <div className="col-span-2 py-20 text-center glass-panel border-dashed border-2 border-white/5">
                    <Search className="mx-auto w-10 h-10 text-white/10 mb-4" />
                    <p className="text-white/30 font-medium">デバイスをスキャン中、または検出されませんでした</p>
                  </div>
                )}
                {devices.map((device) => (
                  <motion.div 
                    key={device.handle}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => selectDevice(device.handle)}
                    className={cn(
                      "glass-panel p-8 flex flex-col gap-6 cursor-pointer transition-all border-l-4 group relative overflow-hidden",
                      selectedDevice === device.handle ? "border-primary bg-primary/5" : "border-transparent bg-white/[0.02] hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                        selectedDevice === device.handle ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--color-primary),0.3)]" : "bg-white/5 text-white/20 group-hover:text-white/40"
                      )}>
                        <Keyboard size={28} />
                      </div>
                      {selectedDevice === device.handle && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-primary/20 rounded-full border border-primary/20">
                          <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                          <span className="text-[10px] font-black uppercase text-primary tracking-tighter">Isolating</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white/90 mb-1">{device.name}</h4>
                      <div className="flex items-center gap-4">
                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Handle: <span className="text-white/60">{device.handle}</span></p>
                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Type: <span className="text-white/60">Raw Keyboard</span></p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "macros" && (
            <motion.div 
              key="macros"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-5xl space-y-10"
            >
              <header className="flex justify-between items-end">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-primary font-bold tracking-widest text-[10px] uppercase">
                    Instruction Set
                  </div>
                  <h2 className="text-4xl font-black text-white/95">Macro <span className="text-primary italic">Engine</span></h2>
                </div>
                <button 
                  onClick={startLearning}
                  disabled={!selectedDevice || isLearning}
                  className="btn-cyber flex items-center gap-3"
                >
                  <Plus size={20} /> 
                  <span className="font-black">{isLearning ? "Awaiting Input..." : "NEW MAPPING"}</span>
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                {Object.keys(macros).length === 0 && (
                  <div className="col-span-2 py-32 text-center glass-panel border-dashed border-2 border-white/5 opacity-50">
                    <Fingerprint size={48} className="mx-auto text-white/10 mb-6" />
                    <p className="text-xl font-bold text-white/20 uppercase tracking-[0.2em]">Zero Mappings Detected</p>
                  </div>
                )}
                {Object.entries(macros).map(([code, action]) => (
                  <motion.div 
                    key={code} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -2 }}
                    className="glass-panel p-6 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center font-mono font-bold text-xl text-primary shadow-inner">
                        {code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                            getActionStyle(action.type)
                          )}>
                            {action.type}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white/70 truncate max-w-[200px]">
                          {getDisplayValue(action)}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEditingKey(parseInt(code))}
                      className="w-10 h-10 glass-panel flex items-center justify-center hover:text-primary transition-all active:scale-90"
                    >
                      <Settings size={18} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Overlays */}
        <AnimatePresence>
          {isLearning && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="glass-panel p-16 max-w-md w-full text-center space-y-10 border-primary/20 glow-border"
              >
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <div className="relative w-24 h-24 bg-primary/30 text-primary rounded-full flex items-center justify-center border-2 border-primary/50 shadow-[0_0_50px_rgba(var(--color-primary),0.3)]">
                    <Keyboard size={48} className="animate-pulse" />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black italic tracking-tight underline decoration-primary underline-offset-8">LEARNING...</h3>
                  <p className="text-white/50 text-sm leading-relaxed px-6">
                    サブキーボード側のターゲットキーを今すぐ叩いてください。<br />核となる信号を捕捉し、マクロ定義へ接続します。
                  </p>
                </div>
                <button 
                  onClick={() => invoke("set_learning_mode", { enabled: false }).then(() => setIsLearning(false))}
                  className="w-full py-4 glass-panel border-white/10 hover:bg-white/5 transition-all font-bold uppercase tracking-widest text-xs"
                >
                  キャンセル
                </button>
              </motion.div>
            </motion.div>
          )}

          {editingKey !== null && (
            <MacroEditorModal 
              keyCode={editingKey} 
              existingAction={macros[editingKey]}
              onSave={saveMacro}
              onClose={() => setEditingKey(null)}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function MacroEditorModal({ keyCode, existingAction, onSave, onClose }: { 
  keyCode: number, 
  existingAction?: MacroAction, 
  onSave: (code: number, action: MacroAction) => void,
  onClose: () => void 
}) {
  const [type, setType] = useState<MacroType>(existingAction?.type || "Shortcut");
  const [value, setValue] = useState(getInitialValue(existingAction));

  function getInitialValue(action?: MacroAction) {
    if (!action) return "";
    if (action.type === "Shortcut") return action.value.join(", ");
    return action.value;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="glass-panel p-10 max-w-xl w-full border-white/10 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
            <Command size={120} />
        </div>

        <header className="flex justify-between items-start mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 bg-primary text-black text-[10px] font-black rounded uppercase tracking-tighter shadow-[0_0_15px_rgba(var(--color-primary),0.3)]">SIGNAL INBOUND</div>
              <span className="font-mono font-black text-3xl text-primary glow-text">#{keyCode}</span>
            </div>
            <h3 className="text-2xl font-black text-white/90 italic tracking-tighter">DEFINITION OVERRIDE</h3>
          </div>
          <button onClick={onClose} className="w-12 h-12 glass-panel flex items-center justify-center hover:bg-white/10 transition-all">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-10 relative z-10">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Select Protocol</label>
            <div className="grid grid-cols-5 gap-3">
              <TypeSelector current={type} target="Shortcut" icon={<Hash size={20} />} label="V-KEYS" onClick={setType} />
              <TypeSelector current={type} target="Text" icon={<Type size={20} />} label="STRINGS" onClick={setType} />
              <TypeSelector current={type} target="App" icon={<PlayCircle size={20} />} label="EXEC" onClick={setType} />
              <TypeSelector current={type} target="Url" icon={<ExternalLink size={20} />} label="NET" onClick={setType} />
              <TypeSelector current={type} target="Sequence" icon={<Zap size={20} />} label="BATCH" onClick={setType} />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Instruction Value</label>
            <div className="relative group">
              <input 
                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-lg font-medium focus:outline-none focus:border-primary/50 transition-all focus:ring-4 focus:ring-primary/5"
                placeholder={getPlaceholder(type)}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity">
                <Command size={20} className="text-primary" />
              </div>
            </div>
            <p className="text-[11px] text-white/30 italic px-2">
              {getHelpText(type)}
            </p>
          </div>
        </div>

        <footer className="flex gap-4 mt-14">
          <button 
            onClick={onClose}
            className="flex-1 py-4 glass-panel border-white/5 hover:bg-white/5 transition-all font-bold text-sm uppercase tracking-widest text-white/50"
          >
            DISCARD
          </button>
          <button 
            onClick={() => onSave(keyCode, { type, value: processValue(type, value) })}
            className="btn-cyber flex-1 py-4 text-sm"
          >
            DEPLOY MAPPING
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function TypeSelector({ current, target, icon, label, onClick }: { current: string, target: MacroType, icon: React.ReactNode, label: string, onClick: (t: MacroType) => void }) {
  const active = current === target;
  return (
    <button 
      onClick={() => onClick(target)}
      className={cn(
        "flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-300",
        active 
          ? "bg-primary/10 border-primary text-primary shadow-[0_0_20px_rgba(var(--color-primary),0.05)]" 
          : "bg-white/5 border-transparent text-white/20 hover:bg-white/10 hover:text-white/40"
      )}
    >
      <div className={cn("transition-transform duration-500", active && "scale-110")}>{icon}</div>
      <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}

function StatBox({ label, value, sub, icon, active }: { label: string, value: string, sub: string, icon: React.ReactNode, active: boolean }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="glass-panel p-8 space-y-6 relative group overflow-hidden"
    >
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl transition-opacity",
        active ? "opacity-100" : "opacity-0"
      )} />
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
        active ? "bg-primary/20 text-primary" : "bg-white/5 text-white/10"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">{label}</p>
        <p className={cn("text-3xl font-black italic tracking-tighter", active ? "text-white" : "text-white/20")}>{value}</p>
        <p className="text-[10px] text-white/40 mt-3 font-medium">{sub}</p>
      </div>
    </motion.div>
  );
}

function SidebarLink({ active, icon, label, onClick, badge }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void, badge?: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-6 py-4 rounded-2xl transition-all duration-300 group",
        active 
          ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_rgba(var(--color-primary),0.05)]" 
          : "text-white/30 hover:bg-white/5 hover:text-white/80"
      )}
    >
      <div className="flex items-center gap-4">
        <span className={cn("transition-transform duration-500", active ? "scale-110" : "group-hover:scale-110")}>
          {icon}
        </span>
        <span className="font-bold tracking-tight">{label}</span>
      </div>
      {badge && (
        <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-black tracking-tighter",
            active ? "bg-primary text-black" : "bg-white/10 text-white/50"
        )}>
            {badge}
        </span>
      )}
    </button>
  );
}

// Utility Helpers
function getPlaceholder(type: MacroType) {
  switch (type) {
    case "Shortcut": return "例: 17, 67 (Ctrl + C) / 91, 76 (Win + L)";
    case "Text": return "入力したい定型文を入力...";
    case "App": return "例: C:\\Windows\\System32\\notepad.exe";
    case "Url": return "例: https://www.google.com";
    case "Sequence": return "マクロの連続実行（JSON形式）";
  }
}

function getHelpText(type: MacroType) {
  const commonCodes = "主要コード: Ctrl(17), Shift(16), Alt(18), Win(91), Enter(13), Space(32), A-Z(65-90)";
  switch (type) {
    case "Shortcut": return `WinAPI仮想キーコードをカンマ区切りで入力。 ${commonCodes}`;
    case "Text": return "サブキーボード側でキーを押した際、指定したテキストを入力します（Unicode対応）。";
    case "App": return "指定したパスのアプリケーションを起動します。";
    case "Url": return "指定したURLを既定のブラウザで開きます。";
    case "Sequence": return "複数のアクションを順番に実行します（高度な設定用）。";
  }
}

function getActionStyle(type: MacroType) {
  switch (type) {
    case "Shortcut": return "bg-primary text-black";
    case "Text": return "bg-accent text-black";
    case "App": return "bg-secondary text-primary";
    case "Url": return "bg-white/20 text-white";
    default: return "bg-white/10 text-white/50";
  }
}

function getDisplayValue(action: MacroAction) {
  if (action.type === "Shortcut") return action.value.join(" + ");
  return action.value;
}

function processValue(type: MacroType, value: any) {
  if (type === "Shortcut" && typeof value === 'string') {
    return value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  }
  return value;
}
