"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./FillForm.module.css";
import Link from "next/link";

type LogEntry = {
  id: string;
  time: string;
  msg: string;
  type: 'info' | 'success' | 'error' | 'action';
};

export default function FillPage() {
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
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString([], { hour12: false }),
      msg,
      type
    };
    setLogs(prev => [...prev, newLog]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('executing');
    startExecution();
  };

  const startExecution = async () => {
    addLog("System initialized. Establishing Uplink...", "action");
    setProgress(5);
    
    await delay(1000);
    addLog("Connecting to Mission Control stream...", "action");
    
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    
    // Connect to the log/screenshot stream first
    const eventSource = new EventSource(`${backendUrl}/api/stream`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        addLog(data.msg, data.level);
        if (data.msg.includes(" MISSION ACCOMPLISHED") || data.msg.includes("completed successfully")) {
          setStep('done');
          eventSource.close();
        }
      } else if (data.type === 'screenshot') {
        setLiveScreenshot(data.data);
      } else if (data.type === 'captcha_required') {
        setIsCaptchaRequired(true);
      }
    };

    eventSource.onerror = () => {
      addLog("Stream connection lost. Retrying...", "error");
    };

    setProgress(15);
    
    try {
      const response = await fetch(`${backendUrl}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`Protocol initiated: ${data.message}`, "success");
        setProgress(30);
      } else {
        addLog(`Uplink Failed: ${data.message}`, "error");
        eventSource.close();
        setStep('form');
      }
    } catch (err) {
      addLog(`Critical Connection Error: ${err instanceof Error ? err.message : 'Unknown Error'}`, "error");
      eventSource.close();
      setStep('form');
    }
  };

  const handleCaptchaSolved = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    try {
      await fetch(`${backendUrl}/api/resume`, { method: 'POST' });
      setIsCaptchaRequired(false);
      addLog("User signal received. Proceeding...", "success");
    } catch (err) {
      addLog("Failed to send resume signal.", "error");
    }
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} style={{ fontSize: '3.5rem' }}>Operation Config</h1>
        <p className={styles.subtitle}>Initialize bot parameters for automated execution.</p>
      </header>

      {step === 'form' ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Section 1: Credentials */}
          <div className={`${styles.section} glass`}>
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
          </div>

          {/* Section 2: Theory */}
          <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 02 - Theory Matrix</h2>
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

          {/* Section 3: Lab */}
          <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 03 - Lab Modules</h2>
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

          {/* Section 4: Mentor */}
          <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 04 - Mentor Directive</h2>
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

          {/* Section 5: Teaching & Learning */}
          <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 05 - Learning Protocols</h2>
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

          {/* Section 6: Feedback Option */}
          <div className={`${styles.section} glass`}>
            <h2 className={styles.sectionTitle}>Section 06 - Sentiment Bias</h2>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Response Strategy</label>
              <select 
                name="feedbackOption" 
                className={styles.select}
                value={formData.feedbackOption}
                onChange={handleInputChange}
              >
                <option value="Never">Never</option>
                <option value="Rarely">Rarely</option>
                <option value="Occasionally">Occasionally</option>
                <option value="Mostly">Mostly</option>
                <option value="Always">Always</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '2rem', width: '100%', padding: '1.5rem', fontSize: '1.2rem' }}>
            Initiate Protocol
          </button>
        </form>
      ) : (
        <div className={styles.executionPanel}>
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
          </div>

          <div className={styles.dashboardGrid}>
            <div className={styles.logStream}>
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
              <div ref={logEndRef} />
            </div>

            <div className={styles.browserView}>
              <div className={styles.liveOverlay}>LIVE_REMOTE_VIEW</div>
              {liveScreenshot ? (
                <img 
                  src={liveScreenshot} 
                  alt="Remote View" 
                  className={styles.liveViewImage}
                />
              ) : (
                <div style={{ color: '#333', fontSize: '0.8rem', letterSpacing: '4px' }}>
                  WAITING_FOR_DATA_STREAM...
                </div>
              )}

              {isCaptchaRequired && (
                <div className={styles.captchaPrompt}>
                  <h3 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>ACTION REQUIRED</h3>
                  <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>Solve CAPTCHA in remote window.</p>
                  <button 
                    className="btn-primary" 
                    style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                    onClick={handleCaptchaSolved}
                  >
                    I've Solved IT
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
