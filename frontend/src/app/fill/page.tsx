"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./FillForm.module.css";
import Link from "next/link";

const PRESETS = {
  "Sem 6, Yr 3, CCAI B": {
    theoryCodes: "CG302,CS305,CS313,CS315,CS348,CS394,EC339",
    theoryTeachers: "Dr. Sufia Rehman,Rahul Ranjan,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Akhlaque Ahmad Khan",
    labCodes: "CS306,CS314,CS396",
    labTeachers: "Falak Alam,Naziya Anjum,Mr. Sunil Singh",
    mentorDept: "Computer Science",
    mentorName: "Nida Khan",
    teachingCodes: "CG302,CS305,CS303,CS306,CS313,CS315,CS348,CS394,CS396,EC339",
    teachingTeachers: "Dr. Sufia Rehman,Rahul Ranjan,Falak Alam,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Mr. Sunil Singh,Akhlaque Ahmad Khan",
    feedbackOption: "Always"
  }
};

type LogEntry = {
  id: string;
  time: string;
  msg: string;
  type: 'info' | 'success' | 'error' | 'action';
};

const CONFIG_STORAGE_KEY = 'feedback_bot_config';
const RUN_STORAGE_KEY = 'feedback_bot_active_run';

interface RunProgress {
  phase: string;
  index: number;
  total: number;
  subject: string;
  teacher: string;
  remaining: number;
}

export default function FillPage() {
  // Hydration-safe state initialization
  const [step, setStep] = useState<'form' | 'executing' | 'done'>('form');
  const [formData, setFormData] = useState({
    studentId: '',
    password: '',
    theoryCodes: '',
    theoryTeachers: '',
    labCodes: '',
    labTeachers: '',
    mentorDept: '',
    mentorName: '',
    teachingCodes: '',
    teachingTeachers: '',
    feedbackOption: 'Always'
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [isCaptchaRequired, setIsCaptchaRequired] = useState(false);
  const [captchaSolution, setCaptchaSolution] = useState("");
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>("SYSTEM_IDLE");
  const [isPaused, setIsPaused] = useState(false);
  const [isKilled, setIsKilled] = useState(false);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [isGlobalSyncPulse, setIsGlobalSyncPulse] = useState(false);
  const [crtState, setCrtState] = useState<'off' | 'on' | 'none'>('none');
  const [runProgressState, setRunProgressState] = useState<RunProgress>({
    phase: 'Idle',
    index: 0,
    total: 0,
    subject: '',
    teacher: '',
    remaining: 0
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  // Initial restoration effect (fixes hydration)
  useEffect(() => {
    // Restore Form Data
    try {
      const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (savedConfig) {
        setFormData(prev => ({ ...prev, ...JSON.parse(savedConfig) }));
      }
    } catch (_) {}

    // Restore Run State
    try {
      const savedRun = sessionStorage.getItem(RUN_STORAGE_KEY);
      if (savedRun) {
        const restored = JSON.parse(savedRun);
        setStep(restored.step || 'form');
        setProgress(restored.progress || 0);
        setIsPaused(!!restored.isPaused);
        setIsKilled(!!restored.isKilled);
        setCurrentStatus(restored.currentStatus || "SYSTEM_IDLE");
        setRunProgressState(restored.runProgressState || {
          phase: 'Idle',
          index: 0,
          total: 0,
          subject: '',
          teacher: '',
          remaining: 0
        });
        
        if (restored.logs) {
          const baseLogs = restored.logs;
          if (restored.step === 'executing' && !restored.isKilled) {
            setLogs([
              ...baseLogs,
              {
                id: `restore-${Date.now()}`,
                time: new Date().toLocaleTimeString([], { hour12: false }),
                msg: "Session state restored from storage.",
                type: 'action'
              }
            ]);
          } else {
            setLogs(baseLogs);
          }
        }
      }
    } catch (_) {}
  }, []);
  const [presetMessage, setPresetMessage] = useState('');

  const handleSendPresetRequest = () => {
    const subject = encodeURIComponent("feedback bot preset request");
    const body = encodeURIComponent(`FEEDBACK BOT PRESET REQUEST\n\n${presetMessage}\n\nSent from Mission Control.`);
    window.location.href = `mailto:pdembla@student.iul.ac.in?subject=${subject}&body=${body}`;
    setPresetModalOpen(false);
    setPresetMessage('');
    addLog("Support signal transmitted. Open your mail client to complete sending.", "success");
  };

  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoFollowRef = useRef(true);
  const interactionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestScreenshotRef = useRef<string | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStreamRef = useRef<() => void>(() => undefined);

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString([], { hour12: false }),
      msg,
      type
    };
    setLogs((prev: LogEntry[]) => [...prev, newLog]);
  }, []);

  useEffect(() => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    if (!logContainerRef.current || !shouldAutoFollowRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  const persistRunState = useCallback((reason: string) => {
    const payload = {
      step,
      progress,
      isPaused,
      isKilled,
      currentStatus,
      runProgressState,
      formData,
      logs: logs.slice(-100)
    };
    sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(payload));
    addLog(`Session state saved (${reason}).`, "info");
  }, [step, progress, isPaused, isKilled, currentStatus, runProgressState, formData, logs, addLog]);

  const clearRunState = useCallback((reason: string) => {
    sessionStorage.removeItem(RUN_STORAGE_KEY);
    addLog(`Session state cleared (${reason}).`, "info");
  }, [addLog]);

  const deriveProgress = useCallback((status: string) => {
    const phaseMatch = status.match(/^PHASE:\s*(.+)$/i);
    if (phaseMatch) {
      setRunProgressState((prev: RunProgress) => ({ ...prev, phase: phaseMatch[1], index: 0, total: 0, remaining: 0 }));
      return;
    }

    const itemMatch = status.match(/^(Theory|Lab|Teaching)\s+(\d+)\/(\d+):\s*([^—]+)—\s*(.+)$/i);
    if (itemMatch) {
      const [, phase, idx, total, subject, teacher] = itemMatch;
      const currentIndex = Number(idx);
      const totalCount = Number(total);
      setRunProgressState({
        phase,
        index: currentIndex,
        total: totalCount,
        subject: subject.trim(),
        teacher: teacher.trim(),
        remaining: Math.max(totalCount - currentIndex, 0)
      });
      return;
    }

    const mentorMatch = status.match(/^Mentor:\s*(.+)\s+\((.+)\)$/i);
    if (mentorMatch) {
      setRunProgressState({
        phase: 'Mentor',
        index: 1,
        total: 1,
        subject: mentorMatch[2],
        teacher: mentorMatch[1],
        remaining: 0
      });
    }
  }, []);

  useEffect(() => {
    // Intersection Observer for section scroll-in animations
    if (step === 'form') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.sectionVisible);
          }
        });
      }, { threshold: 0.1 });

      const sections = document.querySelectorAll(`.${styles.section}`);
      sections.forEach(sec => observer.observe(sec));

      return () => observer.disconnect();
    }
  }, [step]);

  const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetName = e.target.value;
    if (presetName && PRESETS[presetName as keyof typeof PRESETS]) {
      setFormData((prev: any) => ({
        ...prev,
        ...PRESETS[presetName as keyof typeof PRESETS]
      }));
      setSelectedPreset(presetName);
      setIsGlobalSyncPulse(true);
      setTimeout(() => setIsGlobalSyncPulse(false), 900);
      addLog(`Preset "${presetName}" loaded into Matrix.`, "success");
      addLog("Global synchronization pulse executed.", "action");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const queueInteraction = useCallback((task: () => Promise<void>) => {
    interactionQueueRef.current = interactionQueueRef.current
      .then(task)
      .catch(() => undefined);
  }, []);

  const closeStream = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  const connectStream = useCallback(() => {
    closeStream();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const eventSource = new EventSource(`${backendUrl}/api/stream`);
    streamRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        addLog(data.msg, data.level);
      } else if (data.type === 'screenshot') {
        latestScreenshotRef.current = data.data;
        if (frameRequestRef.current === null) {
          frameRequestRef.current = window.requestAnimationFrame(() => {
            setLiveScreenshot(latestScreenshotRef.current);
            frameRequestRef.current = null;
          });
        }
      } else if (data.type === 'captcha_required') {
        setIsCaptchaRequired(true);
      } else if (data.type === 'status_update') {
        setCurrentStatus(data.msg);
        deriveProgress(data.msg);
        addLog(`UPLINK_STATUS: ${data.msg}`, "info");

        if (data.msg === 'MISSION_ACCOMPLISHED') {
          setCrtState('off');
          clearRunState('completed');
          closeStream();
          setTimeout(() => setStep('done'), 900);
        }
        if (data.msg === 'PROCESS_TERMINATED' || data.msg === 'TERMINATING_ALL_PROCESSES') {
          setIsKilled(true);
          setIsPaused(false);
          setCurrentStatus('PROCESS_TERMINATED');
          setCrtState('off');
          clearRunState('terminated');
        }
      }
    };

    eventSource.onerror = () => {
      addLog("Stream connection lost. Retrying...", "error");
      closeStream();
      reconnectTimeoutRef.current = setTimeout(() => {
        if (step === 'executing' && !isKilled) {
          connectStreamRef.current();
        }
      }, 1500);
    };
  }, [closeStream, addLog, deriveProgress, clearRunState, step, isKilled]);

  useEffect(() => {
    connectStreamRef.current = connectStream;
  }, [connectStream]);

  useEffect(() => {
    if (step !== 'executing') return;
    const payload = {
      step,
      progress,
      isPaused,
      isKilled,
      currentStatus,
      runProgressState,
      formData,
      logs: logs.slice(-100)
    };
    sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(payload));
  }, [step, progress, isPaused, isKilled, currentStatus, runProgressState, formData, logs]);

  useEffect(() => {
    if (step === 'executing' && !isKilled) {
      connectStream();
    }
  }, [step, isKilled, connectStream]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('executing');
    setIsKilled(false);
    setCrtState('on');
    setTimeout(() => setCrtState('none'), 900);
    startExecution();
  };

  const startExecution = async () => {
    addLog("System initialized. Establishing Uplink...", "action");
    setProgress(5);

    await delay(1000);
    addLog("Connecting to Mission Control stream...", "action");
    persistRunState('run started');

    setProgress(15);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const executionPayload = {
      ...formData,
      feedbackOption: formData.feedbackOption || 'Always'
    };

    try {
      const response = await fetch(`${backendUrl}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(executionPayload),
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`Protocol initiated: ${data.message}`, "success");
        setProgress(30);
      } else {
        addLog(`Uplink Failed: ${data.message}`, "error");
        addLog("Mission aborted. Use the button below to return to config.", "info");
        clearRunState('execution failed');
        closeStream();
      }
    } catch (err) {
      addLog(`Critical Connection Error: ${err instanceof Error ? err.message : 'Unknown Error'}`, "error");
      addLog("Network uplink severed. Check backend status.", "info");
      clearRunState('connection error');
      closeStream();
    }
  };

  const handleCaptchaSolved = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      await fetch(`${backendUrl}/api/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captcha: captchaSolution })
      });
      setIsCaptchaRequired(false);
      setCaptchaSolution("");
      addLog("User signal received. Solution transmitted to Matrix.", "success");
    } catch (err) {
      addLog("Failed to send resume signal.", "error");
    }
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1280; // Assuming 1280 base width
    const y = ((e.clientY - rect.top) / rect.height) * 800;  // Assuming 800 base height

    try {
      queueInteraction(async () => {
        await fetch(`${backendUrl}/api/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'click', x, y })
        });
      });
    } catch (err) {
      console.error("Interaction failed");
    }
  };

  const handleKeyPress = useCallback(async (key: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    queueInteraction(async () => {
      await fetch(`${backendUrl}/api/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "press", key }),
      });
    });
  }, [queueInteraction]);

  const handleType = useCallback(async (text: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    queueInteraction(async () => {
      await fetch(`${backendUrl}/api/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "type", text }),
      });
    });
  }, [queueInteraction]);

  useEffect(() => {
    if (step !== 'executing') return;

    const specialKeyMap: Record<string, string> = {
      Enter: 'Enter',
      NumpadEnter: 'Enter',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Escape: 'Escape',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End'
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;

      const numpadDigit = /^Numpad([0-9])$/.exec(e.code);
      if (numpadDigit) {
        e.preventDefault();
        void handleType(numpadDigit[1]);
        return;
      }

      const mappedSpecial = specialKeyMap[e.code] || specialKeyMap[e.key];
      if (mappedSpecial) {
        e.preventDefault();
        void handleKeyPress(mappedSpecial);
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        void handleType(e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [step, handleKeyPress, handleType]);

  useEffect(() => {
    return () => {
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
      }
      closeStream();
    };
  }, [closeStream]);

  const setProtocolPaused = async (paused: boolean) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      const endpoint = paused ? '/api/pause' : '/api/resume-protocol';
      const res = await fetch(`${backendUrl}${endpoint}`, { method: 'POST' });
      const data = await res.json();
      setIsPaused(data.isPaused);
      addLog(`SYSTEM: Protocol ${data.isPaused ? 'Paused' : 'Resumed'}`, "action");
      persistRunState(data.isPaused ? 'paused' : 'resumed');
    } catch (_) {
      console.error("Pause failed");
    }
  };

  const ensurePaused = async () => {
    if (!isPaused) {
      await setProtocolPaused(true);
    }
  };

  const ensureResumed = async () => {
    if (isPaused) {
      await setProtocolPaused(false);
    }
  };

  const handleKill = async () => {
    setKillModalOpen(true);
  };

  const confirmKill = async () => {
    setKillModalOpen(false);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      await fetch(`${backendUrl}/api/kill`, { method: 'POST' });
      setIsKilled(true);
      setIsPaused(false);
      setCurrentStatus("PROCESS_TERMINATED");
      setCrtState('off');
      addLog("Process terminated by user", "error");
      clearRunState('terminated');
      closeStream();
    } catch (_) {
      console.error("Kill failed");
    }
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const handleLogScroll = () => {
    if (!logContainerRef.current) return;
    const node = logContainerRef.current;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldAutoFollowRef.current = distanceFromBottom < 32;
  };

  if (step === 'done') {
    return (
      <div className={styles.container}>
        <div className={styles.doneState}>
          <div className={`${styles.doneTitle} animate-float`} style={{ color: 'var(--primary)', textShadow: '0 0 30px var(--primary-glow)' }}>
            MISSION COMPLETE
          </div>
          <p className={styles.subtitle}>All feedback protocols have been executed successfully.</p>
          <div style={{ marginTop: '3rem' }}>
            <Link href="/" className="btn-primary" style={{ padding: '1.2rem 3rem' }}>Return to Base</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${step === 'executing' ? styles.wideContainer : ''}`}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ fontSize: '3.5rem' }}>Operation Config</h1>
        <p className={styles.subtitle}>Initialize bot parameters for automated execution.</p>
      </header>

      {step === 'form' ? (
        <form className={`${styles.form} ${isGlobalSyncPulse ? styles.globalSyncPulse : ''}`} onSubmit={handleSubmit}>
          {/* Section 01: Uplink Credentials (PRIVATE MODE) */}
          {/* <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 01 - Uplink Credentials</h2>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Student ID</label>
                <input 
                  type="text" 
                  name="studentId" 
                  required 
                  className={styles.input} 
                  placeholder="ID Number"
                  value={formData.studentId}
                  onChange={handleInputChange}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Gateway Password</label>
                <input 
                  type="password" 
                  name="password" 
                  required 
                  className={styles.input} 
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div> */}

          {/* Section 1.5: Presets */}
          <div className={`${styles.section} ${styles.sectionVisible} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 01 - Presets</span>
            </div>
            <motion.div
              className={`${styles.inputGroup} ${styles.glassControl}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <label className={styles.label}>Load System Preset</label>
              <div className={styles.customDropdown}>
                <div 
                  className={`${styles.dropdownTrigger} ${openDropdown === 'presets' ? styles.open : ''}`}
                  onClick={() => setOpenDropdown(openDropdown === 'presets' ? null : 'presets')}
                >
                  <span>{selectedPreset || "Select a preset to auto-fill..."}</span>
                  <span className={`${styles.dropdownArrow} ${openDropdown === 'presets' ? styles.open : ''}`}>▼</span>
                </div>
                <AnimatePresence>
                  {openDropdown === 'presets' && (
                    <motion.div 
                      className={styles.dropdownMenu}
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      {Object.keys(PRESETS).map(name => (
                        <div 
                          key={name} 
                          className={`${styles.dropdownItem} ${selectedPreset === name ? styles.dropdownItemActive : ''}`}
                          onClick={() => {
                            handleLoadPreset({ target: { value: name } } as any);
                            setOpenDropdown(null);
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className={styles.presetRequestWrapper}>
                <span>want your own preset?</span>
                <button 
                  type="button" 
                  className={styles.mailEmojiBtn}
                  onClick={() => setPresetModalOpen(true)}
                  title="Request Custom Preset"
                >
                  🖂
                </button>
              </div>
            </motion.div>
          </div>

          {/* Section 2: Feedback Option */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 02 - Sentiment Bias</span>
            </div>
            <motion.div
              className={`${styles.inputGroup} ${styles.glassControl}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
            >
              <label className={styles.label}>Response Strategy</label>
              <div className={styles.customDropdown}>
                <div 
                  className={`${styles.dropdownTrigger} ${openDropdown === 'strategy' ? styles.open : ''}`}
                  onClick={() => setOpenDropdown(openDropdown === 'strategy' ? null : 'strategy')}
                >
                  <span>{formData.feedbackOption}</span>
                  <span className={`${styles.dropdownArrow} ${openDropdown === 'strategy' ? styles.open : ''}`}>▼</span>
                </div>
                <AnimatePresence>
                  {openDropdown === 'strategy' && (
                    <motion.div 
                      className={styles.dropdownMenu}
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      {["Never", "Rarely", "Occasionally", "Mostly", "Always"].map(opt => (
                        <div 
                          key={opt} 
                          className={`${styles.dropdownItem} ${formData.feedbackOption === opt ? styles.dropdownItemActive : ''}`}
                          onClick={() => {
                            handleInputChange({ target: { name: 'feedbackOption', value: opt } } as any);
                            setOpenDropdown(null);
                          }}
                        >
                          {opt}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Section 3: Theory */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 03 - Theory Matrix</span>
            </div>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Subject Codes (comma-separated)</label>
                <input
                  type="text"
                  name="theoryCodes"
                  className={styles.input}
                  placeholder="CG301,CS301,..."
                  value={formData.theoryCodes}
                  onChange={handleInputChange}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Teacher Names (synced)</label>
                <input
                  type="text"
                  name="theoryTeachers"
                  className={styles.input}
                  placeholder="Teacher 1, Teacher 2, ..."
                  value={formData.theoryTeachers}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Lab */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 04 - Lab Modules</span>
            </div>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Lab Codes</label>
                <input
                  type="text"
                  name="labCodes"
                  className={styles.input}
                  placeholder="CS310,CS302,..."
                  value={formData.labCodes}
                  onChange={handleInputChange}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Lab Engineers</label>
                <input
                  type="text"
                  name="labTeachers"
                  className={styles.input}
                  placeholder="Engineer 1, Engineer 2, ..."
                  value={formData.labTeachers}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Section 5: Mentor */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 05 - Mentor Directive</span>
            </div>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Department</label>
                <input
                  type="text"
                  name="mentorDept"
                  className={styles.input}
                  placeholder="Computer Science"
                  value={formData.mentorDept}
                  onChange={handleInputChange}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Mentor Name</label>
                <input
                  type="text"
                  name="mentorName"
                  className={styles.input}
                  placeholder="Identity Prime"
                  value={formData.mentorName}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Section 6: Teaching & Learning */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 06 - Learning Protocols</span>
            </div>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Subject Codes</label>
                <input
                  type="text"
                  name="teachingCodes"
                  className={styles.input}
                  placeholder="CS304,CS301,..."
                  value={formData.teachingCodes}
                  onChange={handleInputChange}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Instructors</label>
                <input
                  type="text"
                  name="teachingTeachers"
                  className={styles.input}
                  placeholder="Instructor 1, Instructor 2, ..."
                  value={formData.teachingTeachers}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '2rem', width: '100%', padding: '1.5rem', fontSize: '1.2rem' }}>
            Initiate Protocol
          </button>

          {/* ── Preset Request Modal ── */}
          <AnimatePresence>
            {presetModalOpen && (
              <motion.div 
                className={styles.modalOverlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPresetModalOpen(false)}
              >
                <motion.div 
                  className={styles.modalContent}
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button type="button" className={styles.modalClose} onClick={() => setPresetModalOpen(false)}>✕</button>
                  <div className={styles.modalHeader}>
                    <div className={styles.modalTitle}>🖂 Request Custom Preset</div>
                    <span className={styles.modalSubtext}>Transmit your configuration requirements to support.</span>
                    <span className={styles.modalSubtext}>Your preset might not be here, but by creating it once u can help others of your class.</span>
                  </div>
                  <div className={styles.modalBody}>
                    <div className={styles.formatGuide}>
                      <strong>Recommended Format:</strong><br/>
                      # Class/Section Info<br/>
                      CLASS_INFO=Sem6, Yr 3, CCAI B<br/><br/>
                      # Theory subjects and teachers<br/>
                      THEORY_SUBJECTS=CG302,CS305,CS313,CS315,CS348,CS394,EC339<br/>
                      THEORY_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Akhlaque Ahmad Khan<br/><br/>
                      # Lab subjects and teachers<br/>
                      LAB_SUBJECTS=CS306,CS314,CS396<br/>
                      LAB_TEACHERS=Falak Alam,Naziya Anjum,Mr. Sunil Singh<br/><br/>
                      # Mentor details<br/>
                      MENTOR_DEPT=Computer Science<br/>
                      MENTOR_NAME=Nida Khan<br/><br/>
                      # Teaching & Learning<br/>
                      TEACHING_SUBJECTS=CG302,CS305,CS303,CS306,CS313,CS315,CS348,CS394,CS396,EC339<br/>
                      TEACHING_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Falak Alam,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Mr. Sunil Singh,Akhlaque Ahmad Khan<br/><br/>
                      # Feedback option<br/>
                      FEEDBACK_OPTION=Always
                    </div>
                    <textarea 
                      className={styles.modalTextarea}
                      placeholder="Enter your preset details or request here..."
                      value={presetMessage}
                      onChange={(e) => setPresetMessage(e.target.value)}
                    />
                    <button 
                      type="button"
                      className="btn-primary" 
                      style={{ width: '100%', padding: '1rem' }}
                      onClick={handleSendPresetRequest}
                    >
                      SUBMIT REQUEST
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      ) : (
        <div className={`${styles.executionPanel} ${step === 'executing' ? styles.wideExecutionPanel : ''}`}>
          {/* ── In-app Terminate Confirmation Modal ── */}
          <AnimatePresence>
            {killModalOpen && (
              <motion.div
                className={styles.termModalOverlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className={styles.termModal}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                >
                  <div className={styles.termModalTitle}>⚠ TERMINATE MISSION?</div>
                  <p className={styles.termModalBody}>
                    This will force-close the browser and abort all pending feedback operations.
                    Confirm to proceed with Emergency Termination.
                  </p>
                  <div className={styles.termModalActions}>
                    <button
                      className={`${styles.commandDeckButton} ${styles.commandDeckKill}`}
                      onClick={confirmKill}
                    >
                      ⏹ CONFIRM TERMINATE
                    </button>
                    <button
                      className={styles.commandDeckButton}
                      onClick={() => setKillModalOpen(false)}
                    >
                      ✕ ABORT
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={styles.dashboardLayout}>
            <div className={styles.browserSection}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '2px' }}>
                  📡 MISSION_STATUS: {isKilled ? 'TERMINATED' : (isPaused ? 'PAUSED' : currentStatus)}
                </div>
                <div style={{ color: '#555', fontSize: '0.65rem', alignSelf: 'center' }}>
                  UPLINK_SECURE
                </div>
              </div>

              <div className={styles.browserView}>
                <div className={styles.liveOverlay}>{isKilled ? 'CONNECTION_LOST' : 'LIVE_REMOTE_VIEW (INTERACTIVE)'}</div>
                {crtState !== 'none' && <div className={`${styles.crtOverlay} ${crtState === 'on' ? styles.crtPowerOn : styles.crtPowerOff}`} />}
                {(liveScreenshot && !isKilled) ? (
                  <img
                    src={liveScreenshot}
                    alt="Remote View"
                    className={`${styles.liveViewImage} ${isCaptchaRequired ? styles.zoomed : ''} ${crtState === 'on' ? styles.glitch : ''} ${crtState === 'off' ? styles.powerOff : ''}`}
                    onClick={handleImageClick}
                    style={{ cursor: 'crosshair' }}
                  />
                ) : (
                  <div style={{ color: isKilled ? '#f00' : '#333', fontSize: '0.8rem', letterSpacing: '4px', textAlign: 'center', padding: '2rem' }}>
                    {isKilled ? 'SYSTEM_SHUTDOWN: PROCESS_TERMINATED' : 'WAITING_FOR_DATA_STREAM...'}
                  </div>
                )}
              </div>

              {runProgressState && runProgressState.phase !== 'Idle' && (
                <div className={`${styles.progressWrapper} glass`}>
                  <div className={styles.progressInfo}>
                    <span>REMOTE UPLINK ESTABLISHED</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className={styles.progressMeta}>
                    <span>{runProgressState.phase}</span>
                    <span>{runProgressState.index > 0 ? `${runProgressState.index}/${runProgressState.total}` : 'Awaiting item'}</span>
                    <span>{runProgressState.subject || 'No subject selected'}</span>
                  </div>
                </div>
              )}

              {isCaptchaRequired && (
                <motion.div
                  className={styles.instructionBox}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.8rem 2.5rem', fontSize: '1.1rem', width: '100%', textShadow: '0 0 10px var(--primary-glow)' }}
                    onClick={handleCaptchaSolved}
                  >
                    CONTINUE PROTOCOL
                  </button>
                  <p>press continue after logging in</p>
                </motion.div>
              )}
            </div>

            <div className={styles.controlSection}>
              <div className={styles.logStream} ref={logContainerRef} onScroll={handleLogScroll}>
                {logs.map(log => (
                  <div key={log.id} className={styles.logEntry}>
                    <span className={styles.logTime}>[{log.time}]</span>
                    <span className={`${styles.logMsg} ${styles[log.type]}`}>
                      {log.type === 'action' && '▶ '}
                      {log.type === 'success' && '✓ '}
                      {log.type === 'error' && '⚠ '}
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>

              {!isKilled && (
                <motion.div
                  className={styles.commandDeck}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className={styles.commandDeckTitle}>⚙ COMMAND DECK</div>
                  <div className={styles.commandDeckRow}>
                    {isPaused ? (
                      <button
                        onClick={ensureResumed}
                        className={`${styles.commandDeckButton} ${styles.commandDeckButtonActive}`}
                      >
                        ▶ Resume Protocol
                      </button>
                    ) : (
                      <button
                        onClick={ensurePaused}
                        className={`${styles.commandDeckButton} ${styles.commandDeckButtonActive}`}
                      >
                        ⏸ Pause Protocol
                      </button>
                    )}
                    <button
                      onClick={handleKill}
                      className={`${styles.commandDeckButton} ${styles.commandDeckKill}`}
                    >
                      ⏹ Kill Mission
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <button
              className="btn-primary"
              style={{ padding: '0.8rem 3rem', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '2px' }}
              onClick={() => {
                closeStream();
                clearRunState('returned to config');
                setStep('form');
              }}
            >
              RETURN TO CONFIG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
