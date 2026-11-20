"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./IliOp.module.css";

interface CourseItem {
  id: string;
  title: string;
  url: string;
  progress?: string;
}

interface LogEntry {
  id: string;
  time: string;
  msg: string;
  type: "info" | "success" | "warning" | "error" | "action";
}

export default function IliOpPage() {
  const [status, setStatus] = useState<string>("IDLE");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isOpeningCourse, setIsOpeningCourse] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<any>(null);
  const sseRef = useRef<EventSource | null>(null);
  const mirrorRef = useRef<HTMLImageElement>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:7860";

  const addLog = (msg: string, type: LogEntry["type"] = "info") => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      time: new Date().toLocaleTimeString(),
      msg,
      type
    };
    setLogs((prev) => [entry, ...prev.slice(0, 100)]);
  };

  // Connect SSE for ILI live stream
  useEffect(() => {
    const sse = new EventSource(`${backendUrl}/api/ili/stream`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          addLog(data.message, data.logType || "info");
        } else if (data.type === "screenshot") {
          setLiveScreenshot(data.screenshot);
        } else if (data.type === "status") {
          setStatus(data.status);
        } else if (data.type === "courses") {
          setCourses(data.courses || []);
        }
      } catch (err) {
        console.error("[ILI SSE] Parse error:", err);
      }
    };

    sse.onerror = () => {
      // Stream reconnecting automatically
    };

    return () => {
      sse.close();
    };
  }, [backendUrl]);

  // Step 1: Start Google OAuth Auth Flow
  const handleStartAuth = async () => {
    setIsLoadingAuth(true);
    setStatus("LAUNCHING_BROWSER");
    addLog("Initiating browser instance targeting https://ilizone.in/login/index.php...", "action");

    try {
      const res = await fetch(`${backendUrl}/api/ili/start-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start ILI Google Auth.");

      addLog("Google Login identity provider button clicked. Awaiting user account selection...", "warning");
      setStatus("AWAITING_GOOGLE_AUTH");
    } catch (err: any) {
      addLog(`Auth Error: ${err.message}`, "error");
      setStatus("ERROR");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Step 2: Navigate to My Courses (my/courses.php)
  const handleNavigateCourses = async () => {
    setIsLoadingCourses(true);
    addLog("Navigating to https://ilizone.in/my/courses.php...", "action");

    try {
      const res = await fetch(`${backendUrl}/api/ili/navigate-courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to navigate to courses.");

      if (data.courses && data.courses.length > 0) {
        setCourses(data.courses);
        addLog(`Successfully discovered ${data.courses.length} enrolled course(s)!`, "success");
        setStatus("COURSES_DISCOVERED");
      } else {
        addLog("Courses page reached, refreshing course list...", "info");
        handleFetchCourses();
      }
    } catch (err: any) {
      addLog(`Courses Navigation Error: ${err.message}`, "error");
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Fetch / Refresh Courses
  const handleFetchCourses = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/ili/get-courses`);
      const data = await res.json();
      if (data.courses) {
        setCourses(data.courses);
        addLog(`Loaded ${data.courses.length} course(s) from active session.`, "success");
      }
    } catch (err: any) {
      console.error("Fetch courses error:", err);
    }
  };

  // Step 3: Open on-demand Course
  const handleOpenCourse = async (course: CourseItem) => {
    setIsOpeningCourse(course.id || course.title);
    addLog(`Opening course: ${course.title} (ID: ${course.id || "N/A"})...`, "action");

    try {
      const res = await fetch(`${backendUrl}/api/ili/open-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, courseUrl: course.url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not open course.");

      addLog(`Successfully opened course: "${data.title || course.title}"`, "success");
      setStatus("IN_COURSE");
    } catch (err: any) {
      addLog(`Open Course Error: ${err.message}`, "error");
    } finally {
      setIsOpeningCourse(null);
    }
  };

  // Step 4: Run Deep JS & DOM Inspection
  const handleInspectJs = async () => {
    setIsInspecting(true);
    addLog("Injecting deep JavaScript & DOM inspection harness...", "action");

    try {
      const res = await fetch(`${backendUrl}/api/ili/inspect-js`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "JS Inspection failed.");

      setInspectionResult(data);
      addLog("Deep JS inspection completed! Form schemas and Moodle config parsed.", "success");
    } catch (err: any) {
      addLog(`Inspect Error: ${err.message}`, "error");
    } finally {
      setIsInspecting(false);
    }
  };

  // Interactive Click Forwarding on Browser Mirror
  const handleMirrorClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!mirrorRef.current) return;
    const rect = mirrorRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    addLog(`Interactive Mirror Click: (${Math.round(xRatio * 100)}%, ${Math.round(yRatio * 100)}%)`, "action");

    try {
      await fetch(`${backendUrl}/api/ili/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "click", xRatio, yRatio })
      });
    } catch (err) {
      console.error("Mirror interaction error:", err);
    }
  };

  // Kill Session
  const handleKillSession = async () => {
    addLog("Terminating active ILI browser instance...", "warning");
    try {
      await fetch(`${backendUrl}/api/ili/kill`, { method: "POST" });
      setStatus("DISCONNECTED");
      setLiveScreenshot(null);
      setCourses([]);
      addLog("ILI browser session terminated cleanly.", "info");
    } catch (err: any) {
      addLog(`Kill Error: ${err.message}`, "error");
    }
  };

  const getStatusBadge = () => {
    if (status === "IDLE" || status === "DISCONNECTED") return <span className={`${styles.statusBadge} ${styles.statusIdle}`}>IDLE</span>;
    if (status === "LAUNCHING_BROWSER" || status === "AWAITING_GOOGLE_AUTH") return <span className={`${styles.statusBadge} ${styles.statusWaiting}`}>{status}</span>;
    if (status === "COURSES_DISCOVERED" || status === "IN_COURSE" || status === "DASHBOARD_SYNCED") return <span className={`${styles.statusBadge} ${styles.statusSuccess}`}>{status}</span>;
    return <span className={`${styles.statusBadge} ${styles.statusActive}`}>{status}</span>;
  };

  return (
    <div className={styles.iliContainer}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <Link href="/ili" className={styles.backLink}>
            <span>← Back to ILI Overview</span>
          </Link>
          <h1 className={styles.title}>
            ILI ZONE <span className={styles.titleHighlight}>AUTOMATION CONSOLE</span>
          </h1>
          <p className={styles.subtitle}>
            Target: <code>https://ilizone.in</code> • Google OAuth SSO • Moodle Course Explorer &amp; JS Inspector
          </p>
        </div>

        <div className={styles.headerActions}>
          {getStatusBadge()}
          <button type="button" className={styles.killBtn} onClick={handleKillSession} title="Close browser & clean session">
            ✕ Terminate Session
          </button>
        </div>
      </header>

      {/* Main Grid: Left = Browser View & Auth, Right = Courses & JS Inspector */}
      <div className={styles.mainGrid}>
        {/* Left Column: Auth & Live Browser View */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span>🌐</span> Live Browser View &amp; Google SSO
            </span>
            <span style={{ fontSize: "0.7rem", color: "#aaa" }}>Interactive Viewport</span>
          </div>

          <div className={styles.mirrorWrapper}>
            {liveScreenshot ? (
              <img
                ref={mirrorRef}
                src={liveScreenshot}
                alt="ILI Live Browser View"
                className={styles.mirrorImage}
                onClick={handleMirrorClick}
                title="Click anywhere to forward click event to browser"
              />
            ) : (
              <div className={styles.mirrorPlaceholder}>
                <div className={styles.mirrorIcon}>🖥️</div>
                <span>Browser session offline or standing by.</span>
                <span style={{ fontSize: "0.7rem", color: "#666" }}>Click below to launch Google SSO pipeline.</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleStartAuth}
              disabled={isLoadingAuth || status === "AWAITING_GOOGLE_AUTH" || status === "DASHBOARD_SYNCED"}
              style={{ flex: 1 }}
            >
              <span>{isLoadingAuth ? "Launching..." : "⚡ Launch Browser & Login via Google"}</span>
            </button>
            <button
              type="button"
              className={styles.actionBtnSecondary}
              onClick={handleNavigateCourses}
              disabled={isLoadingCourses}
            >
              <span>📚 Go to My Courses</span>
            </button>
          </div>
        </div>

        {/* Right Column: Enrolled Courses & Deep JS Inspector */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span>🎓</span> Enrolled Courses ({courses.length})
            </span>
            <button
              type="button"
              className={styles.actionBtnSecondary}
              style={{ padding: "0.3rem 0.6rem", fontSize: "0.7rem" }}
              onClick={handleFetchCourses}
            >
              🔄 Refresh List
            </button>
          </div>

          <div className={styles.coursesList}>
            {courses.length > 0 ? (
              courses.map((course, idx) => (
                <div key={course.id || idx} className={styles.courseCard}>
                  <div className={styles.courseInfo}>
                    <span className={styles.courseTitle} title={course.title}>
                      {course.title || "Untitled Course"}
                    </span>
                    <div className={styles.courseMeta}>
                      <span>ID: <code>{course.id || "N/A"}</code></span>
                      {course.progress && <span>Progress: {course.progress}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.openCourseBtn}
                    onClick={() => handleOpenCourse(course)}
                    disabled={isOpeningCourse === (course.id || course.title)}
                  >
                    {isOpeningCourse === (course.id || course.title) ? "Opening..." : "🚀 Open Course"}
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "#666", fontSize: "0.8rem" }}>
                No courses loaded yet. Complete Google Login, then click &quot;Go to My Courses&quot;.
              </div>
            )}
          </div>

          {/* Deep JS & DOM Inspector */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span className={styles.cardTitle} style={{ fontSize: "0.85rem" }}>
                <span>🔬</span> Deep JavaScript &amp; DOM Analyzer
              </span>
              <button
                type="button"
                className={styles.actionBtnSecondary}
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem" }}
                onClick={handleInspectJs}
                disabled={isInspecting}
              >
                {isInspecting ? "Analyzing..." : "Analyze Current Page"}
              </button>
            </div>

            {inspectionResult && (
              <div className={styles.inspectOutput}>
                {JSON.stringify(inspectionResult, null, 2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terminal & Diagnostic Events Log */}
      <div className={styles.terminalCard}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span>⚡</span> ILI Zone Diagnostic Stream &amp; Events
          </span>
          <span style={{ fontSize: "0.65rem", color: "#888" }}>SSE // LIVE LOGS</span>
        </div>

        <div className={styles.terminalLogs}>
          {logs.map((log) => (
            <div key={log.id} className={styles.logLine}>
              <span className={styles.logTime}>[{log.time}]</span>
              <span
                className={
                  log.type === "success"
                    ? styles.logSuccess
                    : log.type === "warning"
                    ? styles.logWarning
                    : log.type === "error"
                    ? styles.logError
                    : log.type === "action"
                    ? styles.logAction
                    : styles.logMsg
                }
              >
                {log.msg}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div style={{ color: "#555", fontSize: "0.75rem" }}>
              Awaiting commands. Terminal ready.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
