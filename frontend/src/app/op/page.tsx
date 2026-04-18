"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./Op.module.css";
import Link from "next/link";

const PRESETS = {
  "Sem 6, Yr 3, CCAI B": {
    theoryCodes: "CG302,CS305,CS313,CS315,CS348,CS394,EC339",
    theoryTeachers: "Dr. Sufia Rehman,Rahul Ranjan,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Akhlaque Ahmad Khan",
    labCodes: "CS306,CS306,CS314,CS396",
    labTeachers: "Falak Alam,Mohammad Aman,Naziya Anjum,Mr. Sunil Singh",
    mentorDept: "Computer Science",
    mentorName: "Tabassum",
    teachingCodes: "CG302,CS305,CS306,CS306,CS313,CS314,CS315,CS348,CS394,CS396,EC339",
    teachingTeachers: "Dr. Sufia Rehman,Rahul Ranjan,Falak Alam,Mohammad Aman,Naziya Anjum,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Mr. Sunil Singh,Akhlaque Ahmad Khan",
    feedbackOption: "Always"
  }
};

type LogEntry = {
  id: string;
  time: string;
  msg: string;
  type: 'info' | 'success' | 'error' | 'action' | 'warning';
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

const STATUS_MAP: Record<string, string> = {
  'MISSION_START': 'BOOTING_SYSTEM',
  'LOGIN_PHASE': 'UPLINKING_CREDENTIALS',
  'Awaiting Manual Login': 'AWAITING_USER_SYNC',
  'DASHBOARD_REACHED': 'ANALYZING_DASHBOARD',
  'STARTING_FEEDBACK': 'INITIATING_FEEDBACK_PROTOCOLS',
  'SUBMITTING_THEORY': 'UPDATING_THEORY_MATRIX',
  'SUBMITTING_LAB': 'UPDATING_LAB_MODULES',
  'SUBMITTING_MENTOR': 'TRANSMITTING_MENTOR_DIRECTIVE',
  'SUBMITTING_TEACHING': 'UPDATING_LEARNING_PROTOCOLS',
  'PROCESS_TERMINATED': 'CONNECTION_SEVERED',
  'MISSION_ACCOMPLISHED': 'OBJECTIVE_COMPLETE',
  'SYSTEM_IDLE': 'AWAITING_COMMAND'
};

export default function OpPage() {
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
  const [isPageLoaded, setIsPageLoaded] = useState(false);
  const [isGlobalSyncPulse, setIsGlobalSyncPulse] = useState(false);
  const [crtState, setCrtState] = useState<'off' | 'on_boot' | 'on_loaded' | 'none'>('none');
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
  const [statusNotif, setStatusNotif] = useState<{ msg: string, type: 'info' | 'success' | 'error', sticky?: boolean } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const [isHoveringBrowser, setIsHoveringBrowser] = useState(false);
  const [isSendingPreset, setIsSendingPreset] = useState(false);
  const [isInvalidEmail, setIsInvalidEmail] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [specificsModalOpen, setSpecificsModalOpen] = useState(false);
  const [hasContinued, setHasContinued] = useState(false);
  const [selectedSpecCategory, setSelectedSpecCategory] = useState<string | null>(null);
  const [isExecutingSpecific, setIsExecutingSpecific] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('SESSION_ID');
      if (saved) return saved;
      const newId = `sess-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('SESSION_ID', newId);
      return newId;
    }
    return `sess-${Math.random().toString(36).substr(2, 9)}`;
  });
  const [summary, setSummary] = useState<{
    success: number;
    errors: number;
    skipped: number;
    duplicates: number;
    duration: string;
    startTime?: string;
    endTime?: string;
    breakdown?: { theory: number; lab: number; mentor: number; teaching: number; };
    skippedItems?: { category: string; subject?: string; reason: string; }[];
    duplicateItems?: string[];
  } | null>(null);
  const [showReportButton, setShowReportButton] = useState(false);

  const showNotif = (msg: string, type: 'info' | 'success' | 'error' = 'info', sticky = false) => {
    setStatusNotif({ msg, type, sticky });
    if (!sticky) {
      setTimeout(() => setStatusNotif(null), 3500);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('SESSION_ID', sessionId);
    }
  }, [sessionId]);

  // Initial restoration effect (fixes hydration)
  useEffect(() => {
    // Restore Form Data (EXCEPT credentials)
    try {
      const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const { studentId, password, ...rest } = JSON.parse(savedConfig);
        setFormData(prev => ({ ...prev, ...rest }));
      }
    } catch (_) { }

    // Restore Run State (EXCEPT credentials)
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
    } catch (_) { }
  }, []);
  const [presetMessage, setPresetMessage] = useState('');

  const handleSendPresetRequest = async () => {
    if (!presetMessage.trim() || !requestEmail.trim()) {
      setIsInvalidEmail(true);
      return;
    }
    
    // Simple email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(requestEmail)) {
      setIsInvalidEmail(true);
      return;
    }

    setIsSendingPreset(true);
    const startTime = Date.now();

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    
    let isRequestFinished = false;
    let requestResult: { ok: boolean; msg: string } | null = null;

    const performRequest = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/request-preset`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-session-id': sessionId 
          },
          body: JSON.stringify({ email: requestEmail, message: presetMessage })
        });
        const data = await response.json();
        requestResult = { ok: response.ok, msg: data.message || (response.ok ? "" : "Server error") };
      } catch (err) {
        requestResult = { ok: false, msg: "Network error" };
      } finally {
        isRequestFinished = true;
        // If 2s have already passed, the modal is closed and we should show the result now
        if (Date.now() - startTime >= 2000) {
          finalizeUI();
        }
      }
    };

    const finalizeUI = () => {
      if (!requestResult) return;
      setStatusNotif(null); // Clear sticky
      if (requestResult.ok) {
        showNotif("Request transmitted successfully.", "success");
        setPresetMessage("");
      } else {
        showNotif(requestResult.msg, "error");
      }
      setIsSendingPreset(false);
    };

    // Trigger request in background
    void performRequest();

    // Wait for the 2s transmitting state in the modal
    await new Promise(res => setTimeout(res, 2000));

    // Close modal
    setPresetModalOpen(false);

    // If still pending, show the sticky process pill
    if (!isRequestFinished) {
      showNotif("Transmission: In Process. Do not close window", "info", true);
    } else {
      // If already finished within 2s, show result now
      finalizeUI();
    }
  };

  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoFollowRef = useRef(true);
  const interactionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStreamRef = useRef<() => void>(() => undefined);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const typeBufferRef = useRef<string>("");
  const typeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clickIndicator, setClickIndicator] = useState<{ x: number, y: number, id: number } | null>(null);

  const queueInteraction = useCallback((task: () => Promise<void>) => {
    interactionQueueRef.current = interactionQueueRef.current
      .then(task)
      .catch(() => undefined);
  }, []);



  const stripEmoji = (text: string): string => {
    return text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}\u{20E3}\u{1F004}-\u{1F0CF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    let finalMsg = stripEmoji(msg);

    // Filtering logic
    const lowerMsg = finalMsg.toLowerCase();
    if (
      lowerMsg.includes('enrollment field:') ||
      lowerMsg.includes('password field:') ||
      lowerMsg.includes('remote_click: computed matrix coords') ||
      lowerMsg.includes('page warning ignored: $(...).modal is not a function') ||
      lowerMsg.includes('page warning ignored: $(...).modal') ||
      /^(theory|lab|mentor|teaching)\s+\d+\/\d+.+$/i.test(finalMsg.trim())
    ) {
      return;
    }

    if (finalMsg.includes('Entering credentials...')) {
      finalMsg = 'Starting Task...';
    }

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    const timeStr = `${displayHours}.${displayMinutes} ${ampm}`;

    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: timeStr,
      msg: finalMsg,
      type
    };
    setLogs((prev: LogEntry[]) => [...prev, newLog]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { studentId, password, ...configToSave } = formData;
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configToSave));
  }, [formData]);

  useEffect(() => {
    if (!logContainerRef.current || !shouldAutoFollowRef.current) return;
    const node = logContainerRef.current;
    node.scrollTop = node.scrollHeight;
  }, [logs]);

  const persistRunState = useCallback((reason: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { studentId, password, ...runFormData } = formData;

    const payload = {
      step,
      progress,
      isPaused,
      isKilled,
      currentStatus,
      runProgressState,
      formData: runFormData,
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

  const connectStream = useCallback((idOverride?: string) => {
    closeStream();
    const targetSessionId = idOverride || sessionId;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const eventSource = new EventSource(`${backendUrl}/api/stream?sessionId=${targetSessionId}`);
    streamRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        let msg = data.msg;
        if (typeof msg === 'string' && msg.includes('Entering credentials...')) {
          msg = 'Starting Task...';
        }
        addLog(msg, data.level);
        if (typeof data.msg === 'string' && data.msg.includes('IUSMS opened successfully')) {
          setIsPageLoaded(true);
          setIsZoomed(true);
        }
      } else if (data.type === 'run_complete_summary') {
        setSummary(data.data);
        addLog("Summary report generated.", "success");
      } else if (data.type === 'screenshot') {
        setLiveScreenshot(data.data);
      } else if (data.type === 'captcha_required') {
        setIsCaptchaRequired(true);
      } else if (data.type === 'status_update') {
        setCurrentStatus(data.msg);
        deriveProgress(data.msg);
        addLog(`UPLINK_STATUS: ${data.msg}`, "info");

        if (data.msg === 'MISSION_ACCOMPLISHED') {
          setSummary(prev => prev); // keep existing summary from run_complete_summary
          setShowReportButton(true);
          addLog("MISSION_STATUS: Objective complete. System awaiting report retrieval.", "success");
        }
        if (data.msg === 'PROCESS_COMPLETE') {
          // Only return to form if we aren't currently executing or finished with mission
          // (prevents the "blip" when the report transition is in progress)
          if (step === 'form' || (!showReportButton && step !== 'executing')) {
            setStep('form');
            setCrtState('off');
            clearRunState('logged out');
            closeStream();
          }
        }
        if (data.msg === 'PROTOCOL_PAUSED') {
          setIsPaused(true);
        }
        if (data.msg === 'PROTOCOL_RESUMED') {
          setIsPaused(false);
        }
        if (data.msg === 'PROCESS_TERMINATED' || data.msg === 'TERMINATING_ALL_PROCESSES') {
          setIsKilled(true);
          setIsPaused(false);
          setCurrentStatus('PROCESS_TERMINATED');
          setCrtState('off');
          // Wait for CRT off animation before returning to form
          setTimeout(() => {
            setStep('form');
            clearRunState('terminated');
            closeStream();
          }, 1500);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { studentId, password, ...runFormData } = formData;

    const payload = {
      step,
      progress,
      isPaused,
      isKilled,
      currentStatus,
      runProgressState,
      formData: runFormData,
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

    // Check if at least one operational section is filled
    const isReady = formData.theoryCodes.trim() ||
      formData.labCodes.trim() ||
      formData.mentorName.trim() ||
      formData.teachingCodes.trim();

    if (!isReady) {
      showNotif("Might wanna fill the details, Eh?", "error");
      return;
    }

    setLogs([]); // Clear logs on trigger
    setLiveScreenshot(null); // Wipe outdated visual frame fully
    setIsPageLoaded(false); // Reset page mask
    setSummary(null); // Reset summary
    setStep('executing');
    setIsKilled(false);
    setCrtState('on_boot');
    startExecution();
  };

  useEffect(() => {
    if (isPageLoaded && crtState === 'on_boot') {
      setCrtState('on_loaded');
      const timer = setTimeout(() => {
        setCrtState('none');
      }, 850);
      return () => clearTimeout(timer);
    }
  }, [isPageLoaded, crtState]);

  const startExecution = async () => {
    const freshSessionId = `sess-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(freshSessionId);
    setShowReportButton(false);
    setSummary(null);
    setLogs([]);

    addLog("System initialized. Establishing Uplink...", "action");

    await delay(500);
    addLog("Connecting to Mission Control stream...", "action");
    connectStream(freshSessionId);
    persistRunState('run started');

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const executionPayload = {
      ...formData,
      feedbackOption: formData.feedbackOption || 'Always',
      isMobile
    };

    try {
      const response = await fetch(`${backendUrl}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': freshSessionId
        },
        body: JSON.stringify(executionPayload),
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`Protocol initiated: ${data.message}`, "success");
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
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({ captcha: captchaSolution })
      });
      setIsCaptchaRequired(false);
      setIsZoomed(false);
      setCaptchaSolution("");
      addLog("User signal received. Solution transmitted to Matrix.", "success");
    } catch (err) {
      addLog("Failed to send resume signal.", "error");
    }
  };

  const ensureResumed = async () => {
    setHasContinued(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      await fetch(`${backendUrl}/api/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        }
      });
      setIsPaused(false);
      addLog("Manual continuation confirmed. System resuming feedback loop.", "success");
    } catch (err) {
      addLog("Failed to send resume signal.", "error");
    }
  };


  const handleExecuteSpecific = async (category: string, subject?: string, teacher?: string) => {
    setIsExecutingSpecific(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      await fetch(`${backendUrl}/api/specifics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({ category, subject, teacher })
      });

      addLog(`TARGET_LOCKED: ${category} - ${subject || teacher || 'General'}`, "success");

      // Close modal but DO NOT auto-resume. Wait for manual Continue Protocol.
      setSpecificsModalOpen(false);
      setIsExecutingSpecific(false);
    } catch (err) {
      addLog("Failed to lock specific target.", "error");
      setIsExecutingSpecific(false);
    }
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const rect = e.currentTarget.getBoundingClientRect();

    const img = e.currentTarget;
    const { naturalWidth, naturalHeight } = img;
    const imageRatio = naturalWidth / (naturalHeight || 1);
    const containerRatio = rect.width / (rect.height || 1);

    let drawnWidth = rect.width;
    let drawnHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (containerRatio > imageRatio) {
      drawnWidth = rect.height * imageRatio;
      offsetX = (rect.width - drawnWidth) / 2;
    } else {
      drawnHeight = rect.width / imageRatio;
      offsetY = (rect.height - drawnHeight) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    // Ignore clicks on letterbox bars
    if (clickX < 0 || clickX > drawnWidth || clickY < 0 || clickY > drawnHeight) return;

    const x_scaled = (clickX / drawnWidth) * naturalWidth;
    const y_scaled = (clickY / drawnHeight) * naturalHeight;

    // Visual feedback
    setClickIndicator({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
    setTimeout(() => setClickIndicator(null), 400);

    // Debugging coordinates
    addLog(`REMOTE_CLICK: Computed matrix coords (${Math.round(x_scaled)}, ${Math.round(y_scaled)})`, "info");

    // Mobile keyboard bridge
    if (mobileInputRef.current) {
      mobileInputRef.current.focus();
    }

    try {
      // Direct non-blocking fetch for clicks to avoid queue delays
      fetch(`${backendUrl}/api/interact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({ action: 'click', x: x_scaled, y: y_scaled })
      }).then(res => {
        if (!res.ok) addLog(`Interact Failed: status ${res.status}`, "error");
      }).catch(err => {
        addLog(`Interact Network Error: ${err.message}`, "error");
      });
    } catch (err) {
      console.error("Interaction failed");
    }
  };

  const handleKeyPress = useCallback(async (key: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    fetch(`${backendUrl}/api/interact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId
      },
      body: JSON.stringify({ action: "press", key }),
    }).catch(() => undefined);
  }, [sessionId]);

  const handleType = useCallback(async (text: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    fetch(`${backendUrl}/api/interact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId
      },
      body: JSON.stringify({ action: "type", text }),
    }).catch(() => undefined);
  }, [sessionId]);

  const handleBufferedType = useCallback((char: string) => {
    void handleType(char);
  }, [handleType]);

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
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
    };
  }, [step, handleKeyPress, handleType, handleBufferedType]);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  // Toggle no-scroll class on body
  useEffect(() => {
    if (step === 'executing') {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [step]);

  const setProtocolPaused = async (paused: boolean) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    setIsPaused(paused); // Optimistic update
    try {
      const endpoint = paused ? '/api/pause' : '/api/resume-protocol';
      await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        }
      });
      addLog(`SYSTEM: Protocol ${paused ? 'Paused' : 'Resumed'}`, "action");
      persistRunState(paused ? 'paused' : 'resumed');
    } catch (_) {
      setIsPaused(!paused); // Rollback on failure
      console.error("Pause failed");
    }
  };

  const handlePortalLogout = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    addLog("LOGOUT_SEQUENCE_INITIATED", "action");
    try {
      await fetch(`${backendUrl}/api/portal-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        }
      });
      addLog("LOGOUT_COMPLETE: Mission Finished.", "success");
    } catch (err) {
      addLog("LOGOUT_FAILED: Force-closing session...", "error");
    }
    
    // Force CRT shutdown and final state regardless of server result
    addLog("SESSION_FINISHED", "info");
    setCrtState('off');
    await delay(2500);
    setStep('done');
    clearRunState('logged out');
    closeStream();
  };

  const handleLogout = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      addLog("Logging out and closing browser...", "action");
      await fetch(`${backendUrl}/api/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        }
      });
    } catch (_) { }
    setStep('form');
    setLogs([]);
    setLiveScreenshot(null);
    setSummary(null);
    setCurrentStatus('SYSTEM_IDLE');
    setIsPaused(false);
    setIsKilled(false);
    clearRunState('logged out');
    closeStream();
  };

  const ensurePaused = async () => {
    if (!isPaused) {
      await setProtocolPaused(true);
    }
  };



  const handleKill = async () => {
    setKillModalOpen(true);
  };

  const confirmKill = async () => {
    setKillModalOpen(false);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    setLogs([]); // Burn logs on kill
    addLog('[SYSTEM OVERRIDE] Kill sequence initiated...', 'warning');

    try {
      await fetch(`${backendUrl}/api/kill`, { method: 'POST' });
      addLog('CONNECTION SEVERED: Target instance destroyed.', 'error');
      setIsKilled(true);
      setIsPaused(false);
      setCurrentStatus("PROCESS_TERMINATED");
      setCrtState('off');
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
    // Increased threshold to 50px for better sensitivity
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldAutoFollowRef.current = distanceFromBottom < 50;
  };

  if (step === 'done') {
    return (
      <div className={styles.container}>
        <div className={styles.doneState}>
          <div className={`${styles.doneTitle} animate-float`} style={{ color: 'var(--primary)', textShadow: '0 0 30px var(--primary-glow)' }}>
            EXECUTION COMPLETE
          </div>
          <p className={styles.subtitle}>All feedback protocols executed. Review the report below.</p>

          {summary && (
            <div className={styles.summaryCard} style={{ marginTop: '2rem', maxWidth: '640px', margin: '2rem auto 0' }}>
              <div className={styles.summaryHeader}>
                <div className={styles.summaryPulse} />
                <span>MISSION REPORT</span>
                <p>December 16, 1991</p>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>SUBMITTED</span>
                  <span className={styles.summaryValue} style={{ color: '#00ff00' }}>{summary.success}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>FAILED</span>
                  <span className={styles.summaryValue} style={{ color: '#ff4b4b' }}>{summary.errors}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>SKIPPED</span>
                  <span className={styles.summaryValue}>{summary.skipped}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>DUPLICATES</span>
                  <span className={styles.summaryValue} style={{ color: 'var(--primary)' }}>{summary.duplicates}</span>
                </div>
              </div>

              <div className={styles.summaryDuration}>
                <div className={styles.durationLabel}>EXECUTION TIME</div>
                <div className={styles.durationValue}>{summary.duration}</div>
              </div>

              {summary.breakdown && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(240,195,60,0.06)', borderRadius: '6px', fontSize: '0.78rem', color: '#aaa' }}>
                  <div style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontWeight: 600 }}>BREAKDOWN</div>
                  <div>Theory: {summary.breakdown.theory} | Lab: {summary.breakdown.lab} | Mentor: {summary.breakdown.mentor} | Teaching: {summary.breakdown.teaching}</div>
                </div>
              )}

              {summary.skippedItems && summary.skippedItems.length > 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,75,75,0.06)', borderRadius: '6px', fontSize: '0.76rem', color: '#aaa' }}>
                  <div style={{ color: '#ff4b4b', marginBottom: '0.4rem', fontWeight: 600 }}>SKIPPED ({summary.skippedItems.length})</div>
                  {summary.skippedItems.slice(0, 5).map((item, i) => (
                    <div key={i}>[{item.category}] {item.subject || 'N/A'} — {item.reason}</div>
                  ))}
                </div>
              )}

              {summary.duplicateItems && summary.duplicateItems.length > 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(240,195,60,0.06)', borderRadius: '6px', fontSize: '0.76rem', color: '#aaa' }}>
                  <div style={{ color: 'var(--primary)', marginBottom: '0.4rem', fontWeight: 600 }}>ALREADY SUBMITTED ({summary.duplicateItems.length})</div>
                  {summary.duplicateItems.slice(0, 5).map((item, i) => (
                    <div key={i}>{item}</div>
                  ))}
                </div>
              )}

              <div className={styles.summaryActions}>
                <button
                  onClick={handleLogout}
                  className={styles.summaryBtnPrimary}
                >
                  LOGOUT &amp; EXIT
                </button>
                <button
                  onClick={() => { setStep('form'); setSummary(null); setLogs([]); }}
                  className={styles.summaryBtnSecondary}
                >
                  NEW RUN
                </button>
              </div>
            </div>
          )}

          {!summary && (
            <div className={styles.summaryActions} style={{ marginTop: '2rem' }}>
              <button
                onClick={handleLogout}
                className="btn-primary"
                style={{ padding: '1.2rem 3rem' }}
              >
                Logout &amp; Exit
              </button>
              <button
                onClick={() => { setStep('form'); setLogs([]); }}
                className="btn-secondary"
                style={{ padding: '1.2rem 3rem', marginLeft: '1rem' }}
              >
                New Run
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${step === 'executing' ? styles.wideContainer : ''}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          OPERATION <span className={styles.mobileBr} /> CONFIG
        </h1>
        <p className={styles.subtitle}>Initialize bot parameters for automated execution.</p>
      </header>

      {step === 'form' ? (
        <form className={`${styles.form} ${isGlobalSyncPulse ? styles.globalSyncPulse : ''}`} onSubmit={handleSubmit}>

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
                <span>Want your own preset?</span>
                <button
                  type="button"
                  className={styles.mailEmojiBtn}
                  onClick={() => setPresetModalOpen(true)}
                  title="Request Custom Preset"
                >
                  <span className={styles.desktopMail}>🖂</span>
                  <span className={styles.mobileMail}>📩</span>
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
          {/* Section 3: Feedback format */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 03 - Feedback Format</span>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formatGuide}>
                <strong>Directive:</strong><br />
                In each section you can add multiple subjects and teachers separated by commas.<br />
                Ensure correct spelling, correct subject code, synced to the correct techer.<br />
                In lab n teaching quality u hav to mention same subject code twice with different teachers.<br /><br />

                # Theory Matrix<br />
                THEORY_SUBJECTS=CG302,CS305,CS313,CS315,CS348,CS394,EC339<br />
                THEORY_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Akhlaque Ahmad Khan<br /><br />
                # Lab Modules<br />
                LAB_SUBJECTS=CS306,CS314,CS396<br />
                LAB_TEACHERS=Falak Alam,Naziya Anjum,Mr. Sunil Singh<br /><br />
                # Mentor Directive<br />
                MENTOR_DEPT=Computer Science<br />
                MENTOR_NAME=Nida Khan<br /><br />
                # Learning Protocols<br />
                TEACHING_SUBJECTS=CG302,CS305,CS303,CS306,CS313,CS315,CS348,CS394,CS396,EC339<br />
                TEACHING_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Falak Alam,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Mr. Sunil Singh,Akhlaque Ahmad Khan<br /><br />
              </div>
            </div>
          </div>

          {/* Section 4: Theory */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 04 - Theory Matrix</span>
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

          {/* Section 5: Lab */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 05 - Lab Modules</span>
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

          {/* Section 6: Mentor */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 06 - Mentor Directive</span>
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

          {/* Section 7: Teaching & Learning */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionTitle}>
              <span>Section 07 - Learning Protocols</span>
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
                      <strong>Recommended Format:</strong><br />
                      # Class/Section Info<br />
                      CLASS_INFO=Sem6, Yr 3, CCAI B<br /><br />
                      # Theory subjects and teachers<br />
                      THEORY_SUBJECTS=CG302,CS305,CS313,CS315,CS348,CS394,EC339<br />
                      THEORY_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Akhlaque Ahmad Khan<br /><br />
                      # Lab subjects and teachers<br />
                      LAB_SUBJECTS=CS306,CS314,CS396<br />
                      LAB_TEACHERS=Falak Alam,Naziya Anjum,Mr. Sunil Singh<br /><br />
                      # Mentor details<br />
                      MENTOR_DEPT=Computer Science<br />
                      MENTOR_NAME=Nida Khan<br /><br />
                      # Teaching & Learning<br />
                      TEACHING_SUBJECTS=CG302,CS305,CS303,CS306,CS313,CS315,CS348,CS394,CS396,EC339<br />
                      TEACHING_TEACHERS=Dr. Sufia Rehman,Rahul Ranjan,Falak Alam,Naziya Anjum,Mariyam Kidwai,Azra Iftekhar,Mr. Sunil Singh,Mr. Sunil Singh,Akhlaque Ahmad Khan<br /><br />
                      # Feedback option<br />
                      FEEDBACK_OPTION=Always
                    </div>
                    <textarea
                      className={styles.modalTextarea}
                      placeholder="Enter your preset details or request here..."
                      value={presetMessage}
                      onChange={(e) => setPresetMessage(e.target.value)}
                    />
                    <div className={styles.modalInputGroup}>
                      <label className={styles.label}>Your Uplink Address (Email)</label>
                      <input
                        type="email"
                        placeholder="matrix-user@example.com"
                        className={`${styles.modalEmailInput} ${(requestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail)) ? styles.invalidInput : ''}`}
                        value={requestEmail}
                        onChange={(e) => setRequestEmail(e.target.value)}
                      />
                    </div>
                    <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.4' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Note:</span> There are some issues with the mail delivery system. <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Please</span> send it manually {' '}
                      <a 
                        href="https://mail.google.com/mail/?view=cm&fs=1&to=pdembla@student.iul.ac.in&su=New%20Preset%20Request" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.mailEmojiBtn}
                        title="Send via Gmail"
                      >
                        <span className={styles.desktopMail}>🖂</span>
                        <span className={styles.mobileMail}>📩</span>
                      </a>
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%', padding: '1.2rem', marginTop: '1.5rem' }}
                      onClick={handleSendPresetRequest}
                      disabled={isSendingPreset}
                    >
                      {isSendingPreset ? "Transmission..." : "Submit Request"}
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
                      ⏹ TERMINATE
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
                <div style={{
                  color: 'var(--primary)',
                  fontSize: 'clamp(0.5rem, 2vw, 0.7rem)',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                  marginBottom: '0.5rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  📡 STATUS: {isKilled ? 'TERMINATED' : (isPaused ? 'PAUSED' : (STATUS_MAP[currentStatus] || currentStatus))}
                </div>
              </div>

              <div
                className={styles.browserView}
                onDoubleClick={() => setIsZoomed(!isZoomed)}
                onMouseMove={(e) => {
                  if (crosshairRef.current) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    crosshairRef.current.style.left = `${e.clientX - rect.left}px`;
                    crosshairRef.current.style.top = `${e.clientY - rect.top}px`;
                  }
                }}
                onMouseEnter={() => setIsHoveringBrowser(true)}
                onMouseLeave={() => setIsHoveringBrowser(false)}
                style={{ position: 'relative' }}
              >
                {isHoveringBrowser && !isKilled && (
                  <motion.div
                    ref={crosshairRef}
                    className={styles.customCrosshair}
                    animate={{
                      scale: clickIndicator ? 0.6 : 1.2,
                      opacity: 1
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 25, mass: 0.5 }}
                  >
                    <div className={`${styles.crossLine} ${styles.crossLineH}`} />
                    <div className={`${styles.crossLine} ${styles.crossLineV}`} />
                    <div className={styles.centerDot} />
                  </motion.div>
                )}

                <div className={styles.liveOverlay}>{isKilled ? 'CONNECTION_LOST' : 'LIVE_REMOTE_VIEW (INTERACTIVE)'}</div>

                {/* CRT Power Animation Overlay */}
                {crtState !== 'none' && (
                  <div className={`${styles.crtPowerWrapper} ${crtState === 'on_boot' ? styles.crtPowerBoot : (crtState === 'on_loaded' ? styles.crtPowerLoaded : styles.crtPowerOffAnim)}`}>
                    <div className={styles.crtPowerBox} />
                  </div>
                )}

                {/* Black screen for termination state AND dynamic page load mask */}
                <div
                  className={styles.blackScreen}
                  style={{
                    opacity: (isKilled || (!isPageLoaded && step === 'executing')) && crtState === 'none' ? 1 : 0,
                    transition: 'opacity 0.8s ease'
                  }}
                />

                {liveScreenshot ? (
                  <>
                    <img
                      src={liveScreenshot}
                      alt="Live Remote Matrix"
                      className={`${styles.liveViewImage} ${isZoomed ? styles.zoomed : ""}`}
                      onClick={handleImageClick}
                    />
                  </>
                ) : (
                  <div className={styles.browserStatusText} style={{ color: isKilled ? '#f00' : '#333' }}>
                    {isKilled ? 'SYSTEM_SHUTDOWN: PROCESS_TERMINATED' : 'WAITING_FOR_DATA_STREAM...'}
                  </div>
                )}
              </div>

              {/* Hidden input bridge for mobile keyboard support */}
              <input
                ref={mobileInputRef}
                type="text"
                style={{
                  position: 'absolute',
                  opacity: 0,
                  pointerEvents: 'none',
                  left: '-9999px'
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    void handleType(val);
                    e.target.value = ""; // Clear for next char
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleKeyPress('Enter');
                  if (e.key === 'Backspace') void handleKeyPress('Backspace');
                }}
              />
            </div>

            <div className={styles.controlSection}>
              <div className={styles.logStream} ref={logContainerRef} onScroll={handleLogScroll}>
                {logs.map(log => {
                  const toLow = log.msg.toLowerCase();
                  const isGold = toLow.includes('completed') ||
                    toLow.includes('starting task') ||
                    toLow.includes('%') ||
                    toLow.includes('feedback') ||
                    toLow.includes('mentor') ||
                    toLow.includes('subject') ||
                    toLow.includes('submitted') ||
                    toLow.includes('submission');

                  return (
                    <div key={log.id} className={styles.logEntry}>
                      <span className={styles.logTime}>[{log.time}]</span>
                      <span
                        className={`${styles.logMsg} ${styles[log.type]}`}
                        style={isGold && log.type !== 'error' ? { color: '#f0c33c', fontWeight: 'bold' } : {}}
                      >
                        {log.msg}
                      </span>
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>

              {!isKilled && (
                <motion.div
                  className={styles.commandDeck}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className={styles.commandDeckTitle}><span className={styles.spinningGear}>⚙</span> COMMAND DECK</div>
                  <div className={styles.commandDeckRow}>
                    {isCaptchaRequired && (
                      <button
                        onClick={handleCaptchaSolved}
                        className={`${styles.commandDeckButton} ${styles.commandDeckButtonActive}`}
                        style={{ background: 'rgba(200, 163, 44, 0.15)' }}
                      >
                        ▶ Continue Protocol
                      </button>
                    )}
                    {showReportButton ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={async () => {
                            addLog("Commencing final synchronization...", "action");
                            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
                            try {
                              await fetch(`${backendUrl}/api/logout`, {
                                method: 'POST',
                                headers: { 'x-session-id': sessionId }
                              });
                              addLog("Remote viewport severed successfully.", "success");
                            } catch (e) {
                              addLog("Warning: Could not terminate remote session gracefully.", "error");
                            }
                            addLog("Initiating CRT shutdown sequence...", "action");
                            addLog("MISSION_STATUS: Objective complete. System standing down.", "success");
                            setCrtState('off');
                            await delay(2800);
                            setStep('done');
                            clearRunState('completed');
                            closeStream();
                          }}
                          className={`${styles.commandDeckButton} ${styles.commandDeckButtonActive} animate-pulse`}
                          style={{
                            background: 'rgba(0, 255, 0, 0.1)',
                            borderColor: '#00ff00',
                            color: '#00ff00',
                            padding: '0.6rem 2rem',
                            fontSize: '0.5rem'
                          }}
                        >
                          ~ REPORT
                        </button>
                        <button
                          onClick={handlePortalLogout}
                          className={`${styles.commandDeckButton} ${styles.commandDeckLogout}`}
                          style={{
                            padding: '0.6rem 2rem',
                            fontSize: '0.5rem'
                          }}
                        >
                          ➲ LOGOUT
                        </button>
                      </div>
                    ) : (
                      <>
                        {!isCaptchaRequired && (
                          isPaused ? (
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
                          )
                        )}

                        {step === 'executing' && !hasContinued && !isKilled &&
                          !currentStatus.includes('Theory') &&
                          !currentStatus.includes('Lab') &&
                          !currentStatus.includes('Mentor') &&
                          !currentStatus.includes('Teaching') && (
                            <button
                              onClick={() => setSpecificsModalOpen(true)}
                              className={styles.commandDeckButton}
                              style={{
                                borderColor: '#00d2ff',
                                color: '#00d2ff',
                                textShadow: '0 0 10px rgba(0, 210, 255, 0.3)'
                              }}
                            >
                              / SPECIFICS
                            </button>
                          )}
                      </>
                    )}

                    <button
                      onClick={handleKill}
                      className={`${styles.commandDeckButton} ${styles.commandDeckKill}`}
                    >
                      ⏹ Kill Task
                    </button>
                  </div>
                </motion.div>
              )}

            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <button
              className="btn-primary"
              style={{ padding: '0.8rem 3rem', opacity: 0.9, fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.5px' }}
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

      {/* ── Specifics Portal Modal ── */}
      <AnimatePresence>
        {specificsModalOpen && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSpecificsModalOpen(false)}
          >
            <motion.div
              className={styles.specModalContent}
              initial={{ scale: 0.9, opacity: 0, x: 50 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              exit={{ scale: 0.9, opacity: 0, x: 50 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className={styles.modalClose} onClick={() => setSpecificsModalOpen(false)}>✕</button>

              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>⚡ TARGET_SPECIFICS</div>
                <span className={styles.modalSubtext}>Select a targeted feedback vector for immediate execution.</span>
              </div>

              <div className={styles.specBody}>
                {!selectedSpecCategory ? (
                  <div className={styles.specGrid}>
                    {['Theory', 'Lab', 'Mentor', 'Teaching'].map(cat => (
                      <button
                        key={cat}
                        className={styles.specCatBtn}
                        onClick={() => setSelectedSpecCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.specList}>
                    <button className={styles.backLink} onClick={() => setSelectedSpecCategory(null)}>← BACK TO CATEGORIES</button>
                    <div className={styles.specSubTitle}>SELECT {selectedSpecCategory.toUpperCase()} TARGET:</div>

                    <div className={styles.specItemScroll}>
                      {selectedSpecCategory === 'Mentor' ? (
                        <button
                          className={styles.specItemBtn}
                          onClick={() => handleExecuteSpecific('Mentor')}
                        >
                          {formData.mentorName} ({formData.mentorDept})
                        </button>
                      ) : (
                        (() => {
                          const listKey = selectedSpecCategory === 'Theory' ? 'theory' : (selectedSpecCategory === 'Lab' ? 'lab' : 'teaching');
                          const subjects = formData[`${listKey}Codes` as keyof typeof formData].split(',').filter(s => s.trim());
                          const teachers = formData[`${listKey}Teachers` as keyof typeof formData].split(',').filter(s => s.trim());

                          return subjects.map((sub, idx) => (
                            <button
                              key={`${sub}-${idx}`}
                              className={styles.specItemBtn}
                              onClick={() => handleExecuteSpecific(selectedSpecCategory, sub.trim(), teachers[idx]?.trim())}
                            >
                              <span className={styles.specSubCode}>{sub.trim()}</span>
                              <span className={styles.specTeaName}>{teachers[idx]?.trim() || 'No Teacher'}</span>
                            </button>
                          ));
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isExecutingSpecific && (
                <div className={styles.specLockingOverlay}>
                  <div className={styles.loaderLine}></div>
                  <span>LOCKING_TARGET...</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {statusNotif && (
          <motion.div
            className={styles.notificationPill}
            initial={{ opacity: 0, scale: 0.9, y: 20, x: typeof window !== 'undefined' && window.innerWidth < 600 ? 0 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className={`${styles.notifDot} ${styles[statusNotif.type]}`} />
            <span>{statusNotif.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
