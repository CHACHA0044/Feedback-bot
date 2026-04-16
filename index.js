import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import cors from "cors";
import { AsyncLocalStorage } from "async_hooks";

const app = express();
const sessionContext = new AsyncLocalStorage();
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, "");

app.use(cors({
  origin: [FRONTEND_URL, FRONTEND_URL + "/", 'https://feedback-bot-delta.vercel.app'],
  methods: ['GET', 'POST'],
  credentials: true
}));
const PORT = process.env.PORT || 7860;

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FEEDBACK_BOT // UPLINK_ACTIVE</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        
        :root {
          --primary: #f0c33c;
          --primary-glow: rgba(240, 195, 60, 0.4);
          --accent: #00f3ff;
          --bg: #0a0a0a;
        }

        body {
          margin: 0; padding: 0; background: var(--bg); color: var(--primary);
          font-family: 'JetBrains Mono', monospace;
          display: flex; align-items: center; justify-content: center; height: 100vh;
          overflow: hidden; text-transform: uppercase;
        }

        .container {
          position: relative; padding: 4rem; border: 1px solid var(--primary);
          box-shadow: 0 0 40px var(--primary-glow), inset 0 0 20px var(--primary-glow);
          background: rgba(0, 0, 0, 0.9); max-width: 90%; text-align: center;
          border-radius: 4px; z-index: 5;
        }

        .container::after {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(240, 195, 60, 0.03) 1px, rgba(240, 195, 60, 0.03) 2px);
          pointer-events: none;
        }

        h1 {
          margin: 0; font-size: 3rem; letter-spacing: 0.8rem;
          text-shadow: 0 0 15px var(--primary-glow);
          animation: glitch 3s infinite;
        }

        .status { margin-top: 2.5rem; font-size: 1.2rem; letter-spacing: 0.3rem; color: #fff; }
        .status span { color: #00ff00; animation: blink 1s infinite; text-shadow: 0 0 10px #00ff00; }

        .terminal-text { 
           margin-top: 2.5rem; font-size: 0.9rem; color: #666; max-width: 450px; 
           line-height: 1.6; margin-left: auto; margin-right: auto;
        }

        @keyframes glitch {
          0% { transform: translate(0); text-shadow: 0 0 15px var(--primary-glow); }
          2% { transform: translate(-3px, 3px); text-shadow: 3px 0 var(--accent), -3px 0 var(--primary); }
          4% { transform: translate(3px, -3px); text-shadow: -3px 0 var(--accent), 3px 0 var(--primary); }
          6% { transform: translate(0); }
          100% { transform: translate(0); }
        }

        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        .scanlines { 
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), 
                      linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03)); 
          z-index: 10; background-size: 100% 2px, 3px 100%; pointer-events: none; 
        }

        .version {
          position: absolute; bottom: 1.5rem; right: 2rem; font-size: 0.7rem; color: var(--primary); opacity: 0.4;
        }
      </style>
    </head>
    <body>
      <div class="scanlines"></div>
      <div class="container">
        <h1>UPLINK_LIVE</h1>
        <div class="status">FEEDBACK_BOT // STATUS: <span>CONNECTED_</span></div>
        <div class="terminal-text">
          Uplink established successfully. Backend systems are synchronized with production infrastructure. 
          Awaiting mission initiation from dashboard.
        </div>
        <div style="margin-top: 3.5rem; font-size: 0.7rem; color: var(--primary); opacity: 0.4; letter-spacing: 0.2rem;">
          [ SECURE_CORE_IDENTIFIED_CHACHA0044 ]
        </div>
      </div>
      <div class="version">V2.4.5_STABLE</div>
    </body>
    </html>
  `);
});

// ============= SESSION MANAGEMENT SYSTEM =============
const sessions = new Map();

/**
 * Get or create a session for a given IP.
 * @param {string} ip - The client's IP address.
 */
function getOrCreateSession(ip) {
  if (!sessions.has(ip)) {
    sessions.set(ip, {
      id: ip,
      activePage: null,
      activeBrowser: null,
      isPaused: false,
      activeRun: null,
      sseClients: [],
      resumeResolve: null,
      lastActivity: Date.now(),
      stats: {
        startTime: null,
        endTime: null,
        totalSubmissions: 0,
        totalFailed: 0,
        totalSkipped: 0,
        skippedItems: [],
        missingEnvData: [],
        submittedFeedback: new Set(),
        duplicateAttempts: [],
        lastDuplicateDetected: false
      },
      pageZoom: '80'
    });
    console.log(`[SESSION] Created new session for IP: ${ip}`);
  }
  const session = sessions.get(ip);
  session.lastActivity = Date.now();
  return session;
}

async function cleanupSession(ip, reason = null) {
  const session = sessions.get(ip);
  if (!session) return;

  if (reason) {
    console.log(`[SESSION] Cleaning up ${ip}: ${reason}`);
  }

  try {
    if (session.activeBrowser?.isConnected()) {
      await session.activeBrowser.close();
    }
  } catch (_) { }

  session.activePage = null;
  session.activeBrowser = null;
  session.isPaused = false;
  session.resumeResolve = null;
  session.activeRun = null;
}

// Cleanup service: Clear sessions idle for > 1 hour
setInterval(async () => {
  const now = Date.now();
  for (const [ip, session] of sessions.entries()) {
    if (now - session.lastActivity > 3600000) { // 1 hour
      await cleanupSession(ip, "Auto-cleanup after 1 hour of inactivity");
      sessions.delete(ip);
    }
  }
}, 300000); // Check every 5 minutes

function broadcast(ipOrData, data) {
  let ip, payload;
  if (data === undefined) {
    // Legacy call: broadcast(data)
    payload = ipOrData;
    ip = sessionContext.getStore();
  } else {
    // New call: broadcast(ip, data)
    ip = ipOrData;
    payload = data;
  }
  
  if (!ip) return;
  const session = sessions.get(ip);
  if (!session || !session.sseClients) return;
  const json = JSON.stringify(payload);
  session.sseClients.forEach(client => client.res.write(`data: ${json}\n\n`));
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function displayWelcomeBanner() {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
  };

  // Helper to strip color codes for accurate width calculation
  const stripAnsi = str => str.replace(/\x1b\[[0-9;]*m/g, '');

  // Helper to pad each line so all right borders align perfectly
  const padLine = (text, width = 72) => {
    const len = stripAnsi(text).length;
    const pad = Math.max(0, width - len);
    return text + ' '.repeat(pad);
  };

  const lines = [
    `♦ ${colors.green}FEEDBACK AUTOMATION BOT${colors.reset} ♦`,
    ``,
    `Don’t want to fill IUSMS feedback yourself? Yeah, me too...`,
    `Let this bot do it for you in less than 5 minutes!`,
    ``,
    `${colors.magenta}★ Features:${colors.reset}`,
    `• Automated Theory Feedback`,
    `• Automated Lab Feedback`,
    `• Automated Mentor Feedback`,
    `• Automated Teaching & Learning Feedback`,
    `• Smart Error Handling`,
    `• Skips ALready Filled Forms`,
    `• Duplicate Detection`,
    ``,
    `${colors.blue}✦ Instructions:${colors.reset}`,
    `1. Make sure you've filled your .env file with credentials`,
    `2. Run this bot and relax`,
    `3. Bot will handle everything automatically`,
    ``,
    `${colors.red}⚠ Important:${colors.reset}`,
    `• Keep your browser window visible during execution`,
    `• Don't interrupt the process`,
    `• Review the .env file for correct format`,
    `• After completion you can see the final logs`,
    `• You can check manually if having doubts `,
    ``
  ];

  console.log("\n" + colors.cyan + "=".repeat(80) + colors.reset);
  console.log(colors.yellow + "╔" + "═".repeat(74) + "╗");
  lines.forEach(line => console.log(colors.yellow + "║ " + padLine(line, 72) + " ║"));
  console.log(colors.yellow + "╚" + "═".repeat(74) + "╝" + colors.reset);
  console.log(colors.cyan + "=".repeat(80) + colors.reset + "\n");
}

// ============= USER CONFIRMATION =============
async function getUserConfirmation() {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m'
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(
      colors.bright + colors.green + "🚀 Should I start filling your feedback? " +
      colors.yellow + "(Y/N): " + colors.reset,
      (answer) => {
        rl.close();
        const response = answer.trim().toUpperCase();
        resolve(response === 'Y' || response === 'YES');
      }
    );
  });
}

/**
 * Pauses execution and waits for user to press ENTER in terminal.
 * @param {string} message - The message to display to the user.
 */
// Global Resolver for production manual steps
let resumeResolve = null;

async function waitForEnter(message, page = null) {
  throwIfRunAborted();
  const ip = sessionContext.getStore() || 'local';
  if (!IS_LOCAL) {
    log.section("🧩 REMOTE ACTION REQUIRED");
    log.info("Awaiting manual login protocol.");
    log.warning("After manual login is complete, press CONTINUE in the Command Deck.");
    broadcast(ip, { type: 'captcha_required' });
    
    // Wait for the user to solve it via frontend
    const captchaText = await new Promise(resolve => {
      const session = getOrCreateSession(ip);
      session.resumeResolve = resolve;
    });
    throwIfRunAborted();

    if (captchaText && page) {
      log.action("Typing remote captcha solution...");
      // Typical IUSMS captcha field is #txtcap, login is #btn_login
      const solved = await page.evaluate(async (text) => {
        const capInput = document.querySelector('#txtcap') || document.querySelector('input[name*="cap"]');
        const loginBtn = document.querySelector('#btn_login') || document.querySelector('input[type="submit"]');
        if (capInput && loginBtn) {
          capInput.value = text;
          loginBtn.click();
          return true;
        }
        return false;
      }, captchaText);
      
      if (solved) {
        log.success("Captcha applied and login triggered ✓");
        await delay(3000); // Wait for login to process
      }
    }
    return;
  }

  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    rainbow: '\x1b[35m'
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n" + "=".repeat(70));
  console.log(colors.bright + colors.cyan + "👉 ACTION REQUIRED" + colors.reset);
  console.log(colors.yellow + message + colors.reset);
  console.log("=".repeat(70) + "\n");

  return new Promise((resolve) => {
    rl.question(colors.bright + colors.green + "⌨️  Press [ENTER] when ready to continue... " + colors.reset, () => {
      rl.close();
      resolve();
    });
  });
}

// ============= CONFIGURATION PARSING =============
function parseConfiguration(config = {}) {
  const hasConfig = config && Object.keys(config).length > 0;

  const {
    ENROLLMENT_NO: envEnrollment,
    PASSWORD: envPassword,
    FEEDBACK_OPTION: envFeedback,
    MENTOR_DEPT: envMentorDept,
    MENTOR_NAME: envMentorName,
    THEORY_SUBJECTS: envTheorySub,
    THEORY_TEACHERS: envTheoryTea,
    LAB_SUBJECTS: envLabSub,
    LAB_TEACHERS: envLabTea,
    TEACHING_SUBJECTS: envTeachingSub,
    TEACHING_TEACHERS: envTeachingTea,
    ENVIRONMENT: envEnv
  } = process.env;

  // When frontend provides config, it is AUTHORITATIVE — no .env fallback
  const enrollmentNo = config.studentId || config.ENROLLMENT_NO || null;
  const password = config.password || config.PASSWORD || null;
  const feedbackOptionRaw = config.feedbackOption ?? config.FEEDBACK_OPTION ?? 'Always';
  const feedbackOption = (typeof feedbackOptionRaw === 'string' && feedbackOptionRaw.trim()) ? feedbackOptionRaw.trim() : 'Always';

  const mentorDept = config.mentorDept || config.MENTOR_DEPT || null;
  const mentorName = config.mentorName || config.MENTOR_NAME || null;

  const theorySubjects = config.theoryCodes || config.THEORY_SUBJECTS || "";
  const theoryTeachers = config.theoryTeachers || config.THEORY_TEACHERS || "";

  const labSubjects = config.labCodes || config.LAB_SUBJECTS || "";
  const labTeachers = config.labTeachers || config.LAB_TEACHERS || "";

  const teachingSubjects = config.teachingCodes || config.TEACHING_SUBJECTS || "";
  const teachingTeachers = config.teachingTeachers || config.TEACHING_TEACHERS || "";

  const isLocal = !envEnv || envEnv.toLowerCase() === 'local';
  const pageZoom = config.PAGE_ZOOM || '80';

  // Helper for creating ordered pair lists instead of maps (preserves duplicates)
  const createPairList = (subStr, teaStr) => {
    const subjects = parseEnvList(subStr);
    const teachers = parseEnvList(teaStr);
    const list = [];
    subjects.forEach((sub, idx) => {
      list.push({
        subject: sub,
        teacher: teachers[idx] || ""
      });
    });
    return list;
  };

  return {
    enrollmentNo: enrollmentNo || null,
    password: password || null,
    feedbackOption,
    mentorDept,
    mentorName,
    theoryList: createPairList(theorySubjects, theoryTeachers),
    labList: createPairList(labSubjects, labTeachers),
    teachingList: createPairList(teachingSubjects, teachingTeachers),
    isLocal,
    pageZoom,
    isMobile: !!config.isMobile
  };
}

const IS_LOCAL = !process.env.ENVIRONMENT || process.env.ENVIRONMENT.toLowerCase() === 'local';

// URL Configuration - Only used in production mode
const URLS = {
  production: {
    login: 'https://sms.iul.ac.in/Student/login.aspx',
    dashboard: 'https://sms.iul.ac.in/Student/index.aspx',
    feedbackOptions: 'https://sms.iul.ac.in/Student/Feedback.aspx',
    theory: 'https://sms.iul.ac.in/Student/FeedbackTheoryIQAC.aspx',
    lab: 'https://sms.iul.ac.in/Student/FeedbackLabIQAC.aspx',
    mentor: 'https://sms.iul.ac.in/Student/FeedbackMentorIQAC.aspx',
    teaching: 'https://sms.iul.ac.in/Student/FeedbackTeaching.aspx'
  },
  local: {
    login: null, // Will be set to file:// path
    dashboard: null,
    feedbackOptions: null,
    theory: null,
    lab: null,
    mentor: null,
    teaching: null
  }
};

// Parse comma-separated lists
const parseEnvList = (str) => str ? str.split(",").map(s => s.trim()).filter(s => s) : [];

// ============= SESSION-BOUND STATE PROXIES =============
/**
 * Helper to get the current session based on AsyncLocalStorage context.
 */
function getCurrentSession() {
  const ip = sessionContext.getStore();
  return ip ? getOrCreateSession(ip) : null;
}

/**
 * These proxies redirect historical global variables to the correct session
 * based on the AsyncLocalStorage context. This allows legacy code to work
 * without deep refactoring of hundreds of variable references.
 */
const stats = new Proxy({}, {
  get: (_, prop) => getCurrentSession()?.stats[prop],
  set: (_, prop, val) => {
    const session = getCurrentSession();
    if (session) session.stats[prop] = val;
    return true;
  }
});

let isPausedProxy = false; // Fallback
Object.defineProperty(global, 'isPaused', {
  get: () => getCurrentSession()?.isPaused ?? isPausedProxy,
  set: (val) => {
    const session = getCurrentSession();
    if (session) session.isPaused = val;
    else isPausedProxy = val;
  }
});

Object.defineProperty(global, 'activePage', {
  get: () => getCurrentSession()?.activePage,
  set: (val) => {
    const session = getCurrentSession();
    if (session) session.activePage = val;
  }
});

Object.defineProperty(global, 'activeBrowser', {
  get: () => getCurrentSession()?.activeBrowser,
  set: (val) => {
    const session = getCurrentSession();
    if (session) session.activeBrowser = val;
  }
});

Object.defineProperty(global, 'activeRun', {
  get: () => getCurrentSession()?.activeRun,
  set: (val) => {
    const session = getCurrentSession();
    if (session) session.activeRun = val;
  }
});

Object.defineProperty(global, 'resumeResolve', {
  get: () => getCurrentSession()?.resumeResolve,
  set: (val) => {
    const session = getCurrentSession();
    if (session) session.resumeResolve = val;
  }
});

// Helper for broadcasting screenshots to the correct session
async function broadcastScreenshot(ip, fetcher) {
  try {
    const session = sessions.get(ip);
    if (!session || !session.sseClients.length) return;
    
    // Only capture if browser is alive and page is active
    if (session.activeBrowser?.isConnected() && session.activePage && !session.activePage.isClosed()) {
      const data = await fetcher(session.activePage);
      broadcast(ip, { type: 'screenshot', data: `data:image/jpeg;base64,${data}` });
    }
  } catch (e) { /* ignore transient errors during navigation */ }
}

// ============= LOGGING UTILITIES =============
const stripEmoji = (text) => {
  if (typeof text !== 'string') return String(text);
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}\u{20E3}\u{1F004}-\u{1F0CF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const log = {
  section: (title) => {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${"=".repeat(70)}\n`);
  },

  subsection: (label, text) => {
    console.log(`\n>> ${text}`);
    console.log(`${"-".repeat(60)}`);
  },

  info: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[.] ${text}`);
  },

  success: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[+] ${text}`);
  },

  error: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[x] ${text}`);
  },

  warning: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[!] ${text}`);
  },

  action: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[>] ${text}`);
  },

  detail: (text, indent = 2) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix} . ${text}`);
  },

  scroll: (text, indent = 2) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[~] ${text}`);
  },

  skip: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[>>] ${text}`);
  },

  time: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}[t] ${text}`);
    const ip = sessionContext.getStore();
    if (ip) broadcast(ip, { type: 'log', level: 'info', msg: stripEmoji(text) });
  }
};

// Update log methods to broadcast to the correct session
const logMethods = ['info', 'success', 'error', 'warning', 'action', 'detail', 'scroll', 'skip', 'time', 'section', 'subsection'];
logMethods.forEach(method => {
  const original = log[method];
  log[method] = (text, indent = 1) => {
    const clean = stripEmoji(String(text));
    original(clean, indent);
    const ip = sessionContext.getStore();
    if (ip) {
      // Filter noise errors from reaching frontend
      if (method === 'error' && (
        clean.includes('modal is not a function') ||
        clean.includes('net::ERR_ABORTED') ||
        clean.includes('fonts.googleapis') ||
        clean.includes('.css') ||
        clean.includes('.ico')
      )) return;

      broadcast(ip, { 
        type: 'log', 
        level: method === 'error' ? 'error' : (method === 'success' ? 'success' : (method === 'action' ? 'action' : 'info')), 
        msg: clean 
      });
    }
  };
});

// ============= UTILITY FUNCTIONS =============
function isRunAborted() {
  return !!activeRun?.abortController?.signal?.aborted;
}

function throwIfRunAborted() {
  if (isRunAborted()) {
    const err = new Error(activeRun?.terminatedByUser ? "Process terminated by user" : "Run aborted");
    err.name = "AbortError";
    throw err;
  }
}

async function delay(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    throwIfRunAborted();
    if (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function waitWhilePaused() {
  while (getCurrentSession()?.isPaused) {
    throwIfRunAborted();
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function getCurrentTimestamp() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function handleMultiPageNavigation(page, startUrl) {
  try {
    // Get current URL
    const currentUrl = page.url();

    // If we've navigated away from start URL, go back
    if (!currentUrl.includes(startUrl) && currentUrl !== 'about:blank') {
      log.warning("Detected page navigation, returning to main page...", 2);
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(1000);
    }
  } catch (e) {
    log.error(`Navigation handling error: ${e.message}`, 2);
  }
}

async function navigateToURL(page, url, pageName) {
  throwIfRunAborted();
  if (IS_LOCAL) {
    // Local mode - use JavaScript navigation
    log.action(`Navigating to ${pageName} (local mode)...`);
    await page.evaluate((name) => {
      if (typeof showPage === 'function') {
        showPage(name);
      }
    }, pageName);
    await delay(600);
  } else {
    // Production mode - actual page navigation
    log.action(`Navigating to ${pageName}...`);
    log.detail(`URL: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await delay(800);
      
      // Re-apply zoom after navigation persistence
      const session = getCurrentSession();
      if (session && session.pageZoom) {
        await page.evaluate((z) => {
          document.body.style.zoom = z + "%";
        }, session.pageZoom);
      }
      
      log.success(`Loaded ${pageName}`);
      return true;
    } catch (e) {
      if (e.message.includes('Session closed') || e.message.includes('Target closed') || e.message.includes('Page.navigate')) {
        log.error(`❌ Connection lost: Browser window was closed or session timed out.`, 2);
        throw e; // Rethrow to trigger fatal error handling
      }
      log.error(`Failed to navigate to ${pageName}: ${e.message}`, 2);
      return false;
    }
  }

  await ensurePageVisible(page);
}

async function getCurrentPageInfo(page) {
  return await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState
    };
  });
}

async function waitForPageLoad(page, timeout = 10000) {
  try {
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout }
    );
  } catch (e) {
    log.warning('Page load timeout, continuing...', 2);
  }
}

async function waitForNetworkIdle(page, timeout = 3000) {
  try {
    await page.waitForNetworkIdle({ timeout, idleTime: 500 });
  } catch (e) {
    // Network might not become idle, that's okay
    log.detail("Network activity continues...");
  }
}

async function scrollToElement(page, selector, smooth = true) {
  throwIfRunAborted();
  try {
    const exists = await page.$(selector);
    if (!exists) {
      return false;
    }

    if (smooth) {
      log.scroll(`Scrolling to: ${selector}`);
    }

    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        const rect = element.getBoundingClientRect();
        const absoluteTop = window.pageYOffset + rect.top;
        const middle = absoluteTop - (window.innerHeight / 2);
        window.scrollTo({ top: middle, behavior: 'smooth' });
        return true;
      }
      return false;
    }, selector);
    await delay(smooth ? 600 : 300);
    return true;
  } catch (e) {
    return false;
  }
}

async function smoothScrollToView(page, selector) {
  try {
    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if (!isVisible) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, selector);
    await delay(300);
  } catch (e) {
    // Element might not exist, that's okay
  }
}

async function ensurePageVisible(page) {
  throwIfRunAborted();
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await delay(200);
}
async function findLoginFields(page) {
  return await page.evaluate(() => {
    // Try to find enrollment/username field
    const enrollmentInput =
      document.querySelector('input[type="text"]') ||
      document.querySelector('input[name*="enroll"]') ||
      document.querySelector('input[name*="user"]') ||
      document.querySelector('input[placeholder*="Enrollment"]') ||
      document.querySelector('input[placeholder*="enrollment"]');

    // Try to find password field
    const passwordInput =
      document.querySelector('input[type="password"]');

    return {
      enrollmentSelector: enrollmentInput ? getSelector(enrollmentInput) : null,
      passwordSelector: passwordInput ? getSelector(passwordInput) : null
    };

    function getSelector(element) {
      if (element.id) return `#${element.id}`;
      if (element.name) return `input[name="${element.name}"]`;
      if (element.className) return `input.${element.className.split(' ')[0]}`;
      return 'input[type="' + element.type + '"]';
    }
  });
}
// ============= FEEDBACK TRACKING =============
async function checkIfFeedbackExists(page, category, subject, teacher) {
  const feedbackKey = `${category}-${subject}-${teacher}`;

  if (stats.submittedFeedback.has(feedbackKey)) {
    return true;
  }

  // Check localStorage for existing feedback
  const exists = await page.evaluate((cat, subj, teach) => {
    try {
      const responses = JSON.parse(localStorage.getItem('feedbackResponses')) || [];
      return responses.some(r =>
        r.category === cat &&
        r.subject.includes(subj) &&
        r.teacher === teach
      );
    } catch (e) {
      return false;
    }
  }, category, subject, teacher);

  return exists;
}

function markFeedbackSubmitted(category, subject, teacher) {
  const feedbackKey = `${category}-${subject}-${teacher}`;
  stats.submittedFeedback.add(feedbackKey);
}

// ============= PAGE INTERACTION FUNCTIONS =============
async function fillAllQuestions(page, preferredOption) {
  throwIfRunAborted();
  log.action("Filling feedback questions...");
  await delay(300);

  const result = await page.evaluate((preferred) => {
    const questionGroups = new Map();
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

    // Group radio buttons by question
    radios.forEach(radio => {
      const name = radio.name;
      const form = radio.closest('form');

      // Check if radio is visible and belongs to a valid question
      const isVisible = radio.offsetParent !== null &&
        form && form.offsetParent !== null;

      if (!isVisible || !name || name === 'semester') {
        return;
      }
      if (!name.includes('FeedbackGroup') && !name.includes('Questions')) {
        return;
      }
      if (!questionGroups.has(name)) {
        questionGroups.set(name, []);
      }

      questionGroups.get(name).push({
        value: radio.value,
        element: radio
      });
    });

    let answered = 0;
    let total = questionGroups.size;
    const errors = [];
    const details = [];

    // Fill each question with preferred option
    questionGroups.forEach((options, questionName) => {
      const values = options.map(o => o.value);
      let selectedValue = preferred;

      // If preferred option doesn't exist, pick the best available
      if (!values.includes(preferred)) {
        selectedValue = values[values.length - 1] || values[0];
      }

      const option = options.find(o => o.value === selectedValue);
      if (option && option.element) {
        try {
          option.element.click();
          answered++;
          details.push(`${questionName}: ${selectedValue}`);
        } catch (e) {
          errors.push(`Failed to click ${questionName}: ${e.message}`);
        }
      } else {
        errors.push(`No matching option for ${questionName}`);
      }
    });

    return { answered, total, errors, details };
  }, preferredOption);

  log.info(`Found ${result.total} question(s)`, 2);

  if (result.answered > 0) {
    log.success(`Filled ${result.answered}/${result.total} question(s) with "${preferredOption}"`, 2);
  }

  if (result.errors.length > 0) {
    log.warning(`${result.errors.length} error(s) while filling`, 2);
  }

  return result;
}

async function dismissAlerts(page) {
  page.on('dialog', async dialog => {
    const message = dialog.message();
    const msgLower = message.toLowerCase();

    log.info(`Alert: "${message}"`, 2);

    if (msgLower.includes('already submitted') || msgLower.includes('already given')) {
      log.warning("Duplicate detected by server", 2);
      stats.lastDuplicateDetected = true;
      stats.lastAlertResult = 'duplicate';
      await dialog.accept().catch(() => { });
    } else if (msgLower.includes('success') || msgLower.includes('submitted')) {
      log.success("Confirmed via alert", 2);
      stats.lastAlertResult = 'success';
      await dialog.accept().catch(() => { });
    } else {
      stats.lastAlertResult = 'unknown';
      await dialog.accept().catch(() => { });
    }
  });
}

async function handleNetworkErrors(page) {
  page.on('requestfailed', request => {
    const url = request.url();

    // 🧹 Skip noisy analytics and aborted requests
    const failure = request.failure();
    const errorText = failure ? failure.errorText : 'Unknown Error';
    if (
      url.includes('google-analytics') || 
      url.includes('analytics') || 
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('.css') ||
      url.includes('.png') ||
      url.includes('.jpg') ||
      url.includes('.jpeg') ||
      url.includes('.ico') ||
      url.includes('.svg') ||
      errorText === 'net::ERR_ABORTED'
    ) {
      return; 
    }

    // Log only meaningful internal or API network failures
    log.error(`❌ Network request failed: ${url}`, 2);
    if (failure) {
      log.detail(`Failure: ${errorText}`, 3);
    }
  });

  page.on('pageerror', error => {
    if (error.message && error.message.includes('$(...).modal is not a function')) {
      log.detail(`Page warning ignored: ${error.message}`, 2);
      return;
    }
    log.error(`Page error: ${error.message}`, 2);
  });
}

async function waitForAlertResult(timeoutMs = 2000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    throwIfRunAborted();
    if (stats.lastAlertResult !== null) {
      const result = stats.lastAlertResult;
      log.detail(`Alert result: ${result} (${Date.now() - startTime}ms)`);
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  log.detail(`No alert received within ${timeoutMs}ms — assuming success`);
  return 'assumed_success';
}

async function getAllAvailableOptions(page, selectId) {
  return await page.evaluate((id) => {
    const select = document.querySelector(id);
    if (!select) return [];

    return Array.from(select.options)
      .filter(opt => opt.value)
      .map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));
  }, selectId);
}

function normalizeName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|er|md)\.?\s+/g, "") // Remove titles
    .replace(/\./g, " ")                       // Remove dots
    .replace(/\s+/g, " ")                      // Normalize spaces
    .trim();
}

async function smartMatchDropdown(page, selectId, targetText, typeLabel = "ITEM") {
  const normTarget = normalizeName(targetText);
  const targetTokens = normTarget.split(" ").filter(t => t.length > 0);

  log.action(`[${typeLabel} MATCH]`, 2);
  log.detail(`Input: "${targetText}"`, 3);

  const result = await page.evaluate((id, target, tokens) => {
    const select = document.querySelector(id);
    if (!select) return { found: false, error: "Dropdown not identified" };

    const options = Array.from(select.options)
      .filter(opt => opt.value && opt.value !== "0" && opt.value !== "-1")
      .map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));

    if (options.length === 0) return { found: false, error: "Dropdown empty", options: [] };

    // Function to normalize inside browser context
    const norm = (s) => s.toLowerCase().replace(/\b(dr|prof|mr|mrs|ms|er|md)\.?\s+/g, "").replace(/\./g, " ").replace(/\s+/g, " ").trim();

    // 1. Exact Normalized Match
    let match = options.find(opt => norm(opt.text) === target);
    if (match) return { found: true, strategy: "Exact Normalized Match", match, options };

    // 2. Token Set Match (All target tokens exist in option)
    if (tokens.length > 0) {
      match = options.find(opt => {
        const optNorm = norm(opt.text);
        return tokens.every(token => optNorm.includes(token));
      });
      if (match) return { found: true, strategy: "Exact Token Set Match", match, options };
    }

    // Strategy 3 removed — no fuzzy matching to prevent hallucination

    return { found: false, error: "No confident match found", options };
  }, selectId, normTarget, targetTokens);

  if (!result.found) {
    log.error(`${result.error}`, 2);
    log.detail(`Available options: ${result.options?.slice(0, 10).map(o => o.text).join(", ") || "None"}`, 3);
    throw new Error(`[CRITICAL] Could not identify ${typeLabel}: "${targetText}"`);
  }

  log.success(`Matched: "${result.match.text}"`, 2);
  log.detail(`Strategy: ${result.strategy}`, 3);
  return result.match;
}

async function findSubjectOption(page, selectId, subjectCode) {
  try {
    const match = await smartMatchDropdown(page, selectId, subjectCode, "SUBJECT");
    return { found: true, value: match.value, text: match.text };
  } catch (e) {
    return null;
  }
}

async function checkForAlreadySubmittedAlert(page, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let timeoutId = null;

    const handler = async (dialog) => {
      const msg = dialog.message();
      const msgLower = msg.toLowerCase();

      if (msgLower.includes('already submitted') || msgLower.includes('already given')) {
        // Clear timeout immediately
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Accept dialog
        await dialog.accept().catch(() => { });

        // Log ONCE
        log.info(`📢 Server: "${msg}"`, 2);
        log.warning("⚠️ DUPLICATE: Feedback already exists", 2);
        log.skip("⏭️ Skipping to next item", 2);

        // Remove handler
        page.off('dialog', handler);

        // Return true immediately
        resolve(true);
        return;
      } else {
        // Not a duplicate alert
        await dialog.accept().catch(() => { });
      }
    };

    page.on('dialog', handler);

    timeoutId = setTimeout(() => {
      page.off('dialog', handler);
      resolve(false);
    }, timeoutMs);
  });
}

async function findTeacherOption(page, selectId, teacherName) {
  try {
    const match = await smartMatchDropdown(page, selectId, teacherName, "TEACHER");
    return { found: true, value: match.value, text: match.text };
  } catch (e) {
    return null;
  }
}

async function navigateToPage(page, pageName) {
  throwIfRunAborted();
  const url = IS_LOCAL ? null : URLS.production[pageName];
  await navigateToURL(page, url, pageName);
}

// ============= SUBMIT FORM FUNCTION =============
async function submitForm(page, selector) {
  throwIfRunAborted();
  try {
    log.action("Preparing to submit form...", 2);

    // First, scroll to submit button area
    await page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight - 500,
        behavior: 'smooth'
      });
    });
    await delay(1000);

    // Find the submit button with multiple strategies
    const possibleSelectors = [
      '#ContentPlaceHolder1_btn_Submit',
      'input[type="submit"][value="Submit"]',
      'input[id*="btn_Submit"]',
      'input[name*="btn_Submit"]',
      'input[type="submit"]',
      'button[type="submit"]'
    ];

    let foundSelector = null;
    let buttonInfo = null;

    for (const sel of possibleSelectors) {
      buttonInfo = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;

        const isVisible = el.offsetParent !== null;
        const rect = el.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;

        return {
          selector: s,
          visible: isVisible,
          inViewport: isInViewport,
          id: el.id,
          name: el.name,
          value: el.value,
          tagName: el.tagName
        };
      }, sel);

      if (buttonInfo && buttonInfo.visible) {
        foundSelector = sel;
        break;
      }
    }

    if (!foundSelector || !buttonInfo) {
      log.error("Submit button not found!", 2);
      return false;
    }

    log.detail(`Found button: ${buttonInfo.id || buttonInfo.name} (${buttonInfo.tagName})`);

    // Scroll to button if not in viewport
    if (!buttonInfo.inViewport) {
      log.detail("Scrolling to submit button...");
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, foundSelector);
      await delay(1200);
    }

    // Try clicking with multiple methods
    log.action(`Clicking submit button...`, 2);

    // Method 1: Direct click
    try {
      await page.click(foundSelector);
      log.detail("Click executed");
    } catch (clickError) {
      log.warning(`Direct click failed: ${clickError.message}`, 2);

      // Method 2: JavaScript click
      log.detail("Attempting JavaScript click...");
      await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
        }
      }, foundSelector);
    }

    await delay(800);
    log.success("Submit button clicked ✓", 2);
    return true;

  } catch (e) {
    log.error(`Submit error: ${e.message}`, 2);
    return false;
  }
}

// ============= FIXED THEORY FEEDBACK - STOPS IMMEDIATELY ON DUPLICATE =============
async function submitTheoryFeedback(page, subjectCode, teacherName, feedbackOption) {
  throwIfRunAborted();
  if (!teacherName || teacherName.trim() === '') {
    log.skip(`Skipping ${subjectCode} - No teacher name provided`);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Theory', subject: subjectCode, reason: 'Missing teacher name' });
    return 'skipped';
  }

  await navigateToPage(page, 'theory');

  try {
    await page.waitForSelector('#ContentPlaceHolder1_ddlSubject', { visible: true, timeout: 5000 });
  } catch (e) {
    log.error("❌ Theory page did not load", 2);
    stats.totalFailed++;
    return false;
  }

  // Select subject
  const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);
  if (!subject) {
    log.error("❌ Subject not found", 2);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Theory', subject: subjectCode, reason: 'Subject not found' });
    return false;
  }

  await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
  await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
  log.detail(`✓ Selected: ${subject.text}`);
  await delay(1000);

  // Check for duplicate after selection (via global dialog handler flag)
  if (stats.lastDuplicateDetected) {
    stats.lastDuplicateDetected = false; // Reset flag
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate';
  }

  // Check for duplicate after subject selection (local helper)
  const isDuplicateAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
  if (isDuplicateAfterSubject) {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate'; // ✅ RETURN IMMEDIATELY - NO FURTHER ACTION
  }

  // Select teacher
  const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
  if (!teacher) {
    log.error("❌ Teacher not found", 2);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Theory', subject: subjectCode, reason: 'Teacher not found' });
    return false;
  }

  await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
  await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
  log.detail(`✓ Selected: ${teacher.text}`);
  await delay(1000);

  // Check for duplicate after teacher selection (via global dialog handler flag)
  if (stats.lastDuplicateDetected) {
    stats.lastDuplicateDetected = false; // Reset flag
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate';
  }

  // Check for duplicate after teacher selection
  const isDuplicateAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
  if (isDuplicateAfterTeacher) {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate'; // ✅ RETURN IMMEDIATELY - NO FURTHER ACTION
  }

  // ✅ Only reach here if NO duplicate detected
  log.success("✓ Proceeding with submission", 2);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await delay(800);

  // Fill questions
  const fillResult = await fillAllQuestions(page, feedbackOption);

  if (fillResult.total === 0) {
    log.warning("⚠️ No questions found", 2);
    stats.totalFailed++;
    return false;
  }

  // Submit form
  stats.lastAlertResult = null;
  const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');

  if (!submitSuccess) {
    log.error("Submit failed", 2);
    stats.totalFailed++;
    return false;
  }

  // Wait for alert-based confirmation
  const alertResult = await waitForAlertResult(2000);

  if (alertResult === 'duplicate') {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate';
  }

  if (alertResult === 'success' || alertResult === 'assumed_success' || alertResult === 'unknown') {
    markFeedbackSubmitted('Theory Feedback', subject.text, teacherName);
    return true;
  }

  stats.totalFailed++;
  return false;
}

// ============= FIXED LAB FEEDBACK =============
async function submitLabFeedback(page, subjectCode, teacherName, feedbackOption) {
  throwIfRunAborted();
  if (!teacherName || teacherName.trim() === '') {
    log.skip(`Skipping ${subjectCode} - No teacher provided`);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: 'Missing teacher name' });
    return 'skipped';
  }

  try {
    await navigateToPage(page, 'lab');
    await page.waitForSelector('#ContentPlaceHolder1_ddlSubject', { visible: true, timeout: 5000 });

    const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);
    if (!subject) {
      log.error("❌ Subject not found", 2);
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: 'Subject not found' });
      return false;
    }

    await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
    await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
    log.detail(`✓ Selected: ${subject.text}`);
    await delay(1000);

    // Check for duplicate after selection (via global dialog handler flag)
    if (stats.lastDuplicateDetected) {
      stats.lastDuplicateDetected = false; // Reset flag
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    const isDuplicateAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
    if (isDuplicateAfterSubject) {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // ✅ RETURN IMMEDIATELY
    }

    const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
    if (!teacher) {
      log.error("❌ Teacher not found", 2);
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: 'Teacher not found' });
      return false;
    }

    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
    log.detail(`✓ Selected: ${teacher.text}`);
    await delay(1000);

    // Check for duplicate after selection (via global dialog handler flag)
    if (stats.lastDuplicateDetected) {
      stats.lastDuplicateDetected = false; // Reset flag
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    const isDuplicateAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
    if (isDuplicateAfterTeacher) {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // ✅ RETURN IMMEDIATELY
    }

    log.success("✓ Proceeding with submission", 2);

    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);

    const result = await fillAllQuestions(page, feedbackOption);
    if (result.total === 0) {
      log.warning("⚠️ No questions found", 2);
      stats.totalFailed++;
      return false;
    }

    stats.lastAlertResult = null;
    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    if (!submitSuccess) {
      log.error("Submit failed", 2);
      stats.totalFailed++;
      return false;
    }

    const alertResult = await waitForAlertResult(2000);

    if (alertResult === 'duplicate') {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    if (alertResult === 'success' || alertResult === 'assumed_success' || alertResult === 'unknown') {
      markFeedbackSubmitted('Lab Feedback', subject.text, teacherName);
      return true;
    }

    stats.totalFailed++;
    return false;

  } catch (e) {
    log.error(`Lab error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}

// ============= FIXED MENTOR FEEDBACK =============
async function submitMentorFeedback(page, dept, name, feedbackOption) {
  throwIfRunAborted();
  if (!dept || !name) {
    log.skip('Skipping Mentor - Missing data');
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Mentor', reason: 'Missing department or name' });
    return 'skipped';
  }

  try {
    await navigateToPage(page, 'mentor');
    await page.waitForSelector('#ContentPlaceHolder1_ddldept', { visible: true, timeout: 5000 });

    log.action("Selecting mentor...", 2);

    await scrollToElement(page, '#ContentPlaceHolder1_ddldept');

    const deptOptions = await page.evaluate((selectId) => {
      const select = document.querySelector(selectId);
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));
    }, '#ContentPlaceHolder1_ddldept');

    const deptMatch = await smartMatchDropdown(page, '#ContentPlaceHolder1_ddldept', dept, "DEPARTMENT");
    await page.select("#ContentPlaceHolder1_ddldept", deptMatch.value);
    log.detail(`✓ Selected: ${deptMatch.text}`);
    await delay(1500);

    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    const mentorMatch = await smartMatchDropdown(page, '#ContentPlaceHolder1_ddlTeacherCode', name, "MENTOR");

    await page.select("#ContentPlaceHolder1_ddlTeacherCode", mentorMatch.value);
    log.detail(`✓ Selected: ${mentorMatch.text}`);
    await delay(1000);

    // Check for duplicate after selection (via global dialog handler flag)
    if (stats.lastDuplicateDetected) {
      stats.lastDuplicateDetected = false; // Reset flag
      stats.duplicateAttempts.push(`Mentor: ${name} (${dept})`);
      return 'duplicate';
    }

    const isDuplicate = await checkForAlreadySubmittedAlert(page, 1500);
    if (isDuplicate) {
      stats.duplicateAttempts.push(`Mentor: ${name} (${dept})`);
      return 'duplicate'; // ✅ RETURN IMMEDIATELY
    }

    log.success("✓ Proceeding with submission", 2);

    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);

    const result = await fillAllQuestions(page, feedbackOption);
    if (result.total === 0) {
      log.warning("⚠️ No questions found", 2);
    }

    stats.lastAlertResult = null;
    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    if (!submitSuccess) {
      log.error("Submit failed", 2);
      stats.totalFailed++;
      return false;
    }

    const alertResult = await waitForAlertResult(2000);

    if (alertResult === 'duplicate') {
      stats.duplicateAttempts.push(`Mentor: ${name} (${dept})`);
      return 'duplicate';
    }

    if (alertResult === 'success' || alertResult === 'assumed_success' || alertResult === 'unknown') {
      markFeedbackSubmitted('Mentor Feedback', dept, name);
      return true;
    }

    stats.totalFailed++;
    return false;

  } catch (e) {
    log.error(`Mentor error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}

// ============= FIXED TEACHING FEEDBACK =============
async function submitTeachingFeedback(page, subjectCode, teacherName, feedbackOption) {
  throwIfRunAborted();
  if (!teacherName || teacherName.trim() === '') {
    log.skip(`Skipping ${subjectCode} - No teacher provided`);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: 'Missing teacher name' });
    return 'skipped';
  }

  try {
    await navigateToPage(page, 'teaching');
    await page.waitForSelector('#ContentPlaceHolder1_ddlSubject', { visible: true, timeout: 5000 });

    const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);
    if (!subject) {
      log.error("❌ Subject not found", 2);
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: 'Subject not found' });
      return false;
    }

    await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
    await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
    log.detail(`✓ Selected: ${subject.text}`);
    await delay(1000);

    // Check for duplicate after selection (via global dialog handler flag)
    if (stats.lastDuplicateDetected) {
      stats.lastDuplicateDetected = false; // Reset flag
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    const isDuplicateAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
    if (isDuplicateAfterSubject) {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // ✅ RETURN IMMEDIATELY
    }

    const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
    if (!teacher) {
      log.error("❌ Teacher not found", 2);
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: 'Teacher not found' });
      return false;
    }

    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
    log.detail(`✓ Selected: ${teacher.text}`);
    await delay(1000);

    // Check for duplicate after selection (via global dialog handler flag)
    if (stats.lastDuplicateDetected) {
      stats.lastDuplicateDetected = false; // Reset flag
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    const isDuplicateAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
    if (isDuplicateAfterTeacher) {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // ✅ RETURN IMMEDIATELY
    }

    log.success("✓ Proceeding with submission", 2);

    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);

    const result = await fillAllQuestions(page, feedbackOption);
    if (result.total === 0) {
      log.warning("⚠️ No questions found", 2);
      stats.totalFailed++;
      return false;
    }

    stats.lastAlertResult = null;
    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    if (!submitSuccess) {
      log.error("Submit failed", 2);
      stats.totalFailed++;
      return false;
    }

    const alertResult = await waitForAlertResult(2000);

    if (alertResult === 'duplicate') {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    if (alertResult === 'success' || alertResult === 'assumed_success' || alertResult === 'unknown') {
      markFeedbackSubmitted('Teaching & Learning Feedback', subject.text, teacherName);
      return true;
    }

    stats.totalFailed++;
    return false;

  } catch (e) {
    log.error(`Teaching error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}

// ============= MAIN EXECUTION =============
async function run(inputConfig = {}, ip = 'local') {
  return await sessionContext.run(ip, async () => {
    const abortController = new AbortController();
    activeRun = {
      abortController,
      terminatedByUser: false
    };

    const config = parseConfiguration(inputConfig);
  const { 
    enrollmentNo, password, feedbackOption, mentorDept, mentorName, 
    theoryList, labList, teachingList, pageZoom, isMobile
  } = config;

  const session = getCurrentSession();
  if (session) {
    session.pageZoom = pageZoom;
  }

  // Validate required fields
  if (!feedbackOption) {
    throw new Error("Missing required configuration (Feedback Option)");
  }

  stats.startTime = Date.now();
  const startTimestamp = getCurrentTimestamp();
  const ip = sessionContext.getStore() || 'local';

  log.section("FEEDBACK AUTOMATION BOT STARTED");
  log.time(`Start Time: ${startTimestamp}`);
  log.info("Configuration loaded successfully");
  log.detail(`Mode: ${IS_LOCAL ? 'LOCAL (Testing)' : 'PRODUCTION (Live Site)'}`);
  log.detail(`Username: ${enrollmentNo || 'N/A'}`);
  log.detail(`Feedback Option: ${feedbackOption}`);
  log.detail(`Theory Subjects: ${theoryList.length}`);
  log.detail(`Lab Subjects: ${labList.length}`);
  log.detail(`Teaching Subjects: ${teachingList.length}`);
  log.detail(`Mentor Feedback: ${mentorDept && mentorName ? 'Yes' : 'No'}`);
  log.detail(`Applied Zoom: ${pageZoom}%`);

  log.section("LAUNCHING BROWSER");
  const browser = await puppeteer.launch({
    headless: IS_LOCAL ? false : "new",
    slowMo: IS_LOCAL ? 30 : 0,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ],
    defaultViewport: isMobile 
      ? { width: 375, height: 667, isMobile: true, hasTouch: true } 
      : (IS_LOCAL ? null : { width: 1280, height: 800 })
  });

  const page = await browser.newPage();

  // Set login URL based on environment
  let loginUrl;
  if (IS_LOCAL) {
    loginUrl = `file://${path.join(__dirname, "mock-portal", "login.html")}`;
    URLS.local.login = loginUrl;
  } else {
    loginUrl = URLS.production.login;
  }

  dismissAlerts(page);
  activePage = page;
  activeBrowser = browser;
  handleNetworkErrors(page);

  const bindActivePage = (nextPage, reason) => {
    if (!nextPage || nextPage.isClosed()) return;
    sessionContext.run(ip, () => {
      activePage = nextPage;
      handleNetworkErrors(nextPage);
      if (reason) {
        log.info(`[TAB SWITCH] ${reason}`);
        broadcast(ip, { type: 'status_update', msg: `TAB_SWITCH: ${reason}` });
      }
    });
  };

  // Track new tabs/windows — always update activePage so screenshot loop follows automation
  const onTargetCreated = async (target) => {
    if (target.type() === 'page') {
      try {
        const newPage = await target.page();
        if (newPage) {
          bindActivePage(newPage, 'New window focused');
          newPage.on('popup', popup => bindActivePage(popup, 'Popup focused'));
          newPage.on('framenavigated', () => bindActivePage(newPage));
        }
      } catch (e) {
        // ignore if target already closed
      }
    }
  };
  browser.on('targetcreated', onTargetCreated);
  browser.on('targetchanged', onTargetCreated);
  page.on('popup', popup => bindActivePage(popup, 'Popup focused'));
  page.on('framenavigated', () => bindActivePage(page));

  log.success("Browser launched successfully");

  // Screenshot broadcasting loop — near-real-time cadence for smooth live manual interaction
  let isCapturingFrame = false;
  const frameIntervalMs = IS_LOCAL ? 100 : 40; // High performance cadence (25fps)
  let frameCount = 0;
  const screenshotInterval = setInterval(async () => {
    if (isCapturingFrame) return;
    await sessionContext.run(ip, async () => {
      try {
        const session = sessions.get(ip);
        if (!session || !session.sseClients.length) return;
        throwIfRunAborted();
        
        const capturePage = activePage || page;
        if (browser.isConnected() && capturePage && !capturePage.isClosed()) {
          isCapturingFrame = true;
          const screenshotData = await capturePage.screenshot({ 
            encoding: 'base64',
            type: 'jpeg',
            quality: 40
          });
          
          broadcast(ip, { type: 'screenshot', data: `data:image/jpeg;base64,${screenshotData}` });
          
          frameCount++;
          if (frameCount % 60 === 0) {
            log.info(`[UPLINK] Stream active: ${frameCount} frames transmitted`);
          }
        } else if (!browser.isConnected()) {
          clearInterval(screenshotInterval);
        }
      } catch (e) {
        if (e?.name === 'AbortError') {
          clearInterval(screenshotInterval);
        }
      } finally {
        isCapturingFrame = false;
      }
    });
  }, frameIntervalMs);

  // ============= LOGIN =============
  log.section("AUTHENTICATION");

  log.action("Opening login page...");
  log.detail(`URL: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await delay(800);
  
  // Detect IUSMS Server Error
  const serverErrorDetected = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes("Unable to connect to server") || text.includes("Server Error");
  });

  if (serverErrorDetected) {
    log.error("SYSTEM ALERT: IUSMS Server is currently unresponsive (Unable to connect to server).");
    log.info("This is an official IUSMS error. Please try again later.");
    await browser.close();
    clearInterval(screenshotInterval);
    return;
  }

  log.success("IUSMS opened successfully.");
  log.section("MANUAL LOGIN REQUIRED");
  log.info("Please login manually.");
  log.info("Click Continue Protocol after login.");

  log.action("Entering credentials...");

  // Find the actual input field selectors
  const loginFields = await findLoginFields(page);

  if (!loginFields.enrollmentSelector || !loginFields.passwordSelector) {
    log.error("Could not find login input fields");
    throw new Error("Login form fields not found on page");
  }

  log.detail(`Enrollment field: ${loginFields.enrollmentSelector}`);
  log.detail(`Password field: ${loginFields.passwordSelector}`);

  const loginMessage = "Please LOGIN manually in the Mission Control view. Once you reach the Dashboard, press SOLVE MATRIX to continue.";
  broadcast(ip, { type: 'status_update', msg: 'Awaiting Manual Login' });
  await waitForEnter(loginMessage, page);

  log.success("Proceeding after manual login... ✓");

  await page.evaluate((zoom) => {
    document.body.style.zoom = zoom + "%";
  }, pageZoom);
  log.info(`Auto-zoom adjustment confirmed: ${pageZoom}%`, 2);

  await ensurePageVisible(page);
  log.success("Login successful! ✓");

  // ============= DASHBOARD =============
  log.section("DASHBOARD");
  log.action("Verifying dashboard...");

  const pageInfo = await getCurrentPageInfo(page);
  log.detail(`Current URL: ${pageInfo.url}`);
  let missingTheorySubjects = [];
  if (IS_LOCAL) {
    try {
      await page.waitForSelector('#dashboardPage', { visible: true, timeout: 5000 });
      log.success("Dashboard loaded");
    } catch (e) {
      log.warning("Dashboard verification: " + e.message);
    }
  } else {
    log.success("Dashboard page reached");
  }

  // Check for available subjects
  if (IS_LOCAL) {
    log.section("CHECKING AVAILABLE OPTIONS");

    await navigateToPage(page, 'theory');
    await page.waitForSelector('#theorySubject', { timeout: 3000 }).catch(() => { });
    const availableTheorySubjects = await getAllAvailableOptions(page, '#theorySubject');
    const providedTheorySubjects = Object.keys(theoryMap);
    const missingTheorySubjects = availableTheorySubjects.filter(
      opt => !providedTheorySubjects.some(s => opt.value.includes(s) || opt.text.includes(s))
    );

    if (missingTheorySubjects.length > 0) {
      log.warning(`${missingTheorySubjects.length} theory subject(s) not in .env`);
    }
  }

  // Navigate to feedback
  log.section("STARTING FEEDBACK SUBMISSION");

  if (IS_LOCAL) {
    await navigateToPage(page, 'dashboard');
    await delay(500);
    await scrollToElement(page, '.link-button');
    await page.evaluate(() => {
      const feedbackLink = document.querySelector('.link-button');
      if (feedbackLink) feedbackLink.click();
    });
    await delay(1000);
  } else {
    await navigateToURL(page, URLS.production.feedbackOptions, 'feedbackOptions');
  }

  await ensurePageVisible(page);
  log.success("Ready to submit feedback");
  // --- Detect and log all feedback links on the Feedback.aspx page ---
  try {
    log.action("Scanning available feedback links on Feedback.aspx...", 1);
    const links = await page.$$eval('a[id*="lnk"]', els =>
      els.map(e => ({
        id: e.id,
        text: e.textContent.trim(),
        href: e.href
      }))
    );

    if (links.length === 0) {
      log.warning("No feedback links detected on page.", 2);
    } else {
      links.forEach(l => log.detail(`Found link → [${l.id}] : "${l.text}" → ${l.href}`, 2));
      const ordered = [
        { key: 'theory', tokens: ['theory', 'iqac', 'lnktheory'] },
        { key: 'lab', tokens: ['lab', 'lnklab'] },
        { key: 'mentor', tokens: ['mentor', 'lnkmentor'] },
        { key: 'teaching', tokens: ['teaching', 'learning', 'lnkteach'] }
      ];
      ordered.forEach(({ key, tokens }) => {
        const match = links.find(link => {
          const blob = `${link.id} ${link.text} ${link.href}`.toLowerCase();
          return tokens.some(token => blob.includes(token));
        });
        if (match?.href) {
          URLS.production[key] = match.href;
        }
      });
      log.detail(`Category execution order locked: Theory → Lab → Mentor → Teaching & Learning`, 2);
    }
  } catch (err) {
    log.error(`Feedback link scan error: ${err.message}`, 2);
  }

  // ============= THEORY FEEDBACK =============
  broadcast(ip, { type: 'status_update', msg: 'PHASE: Theory Feedback' });
  if (theoryList.length > 0) {
    log.section("THEORY FEEDBACK SUBMISSION");
    log.info(`${theoryList.length} theory subject(s) to process\n`);

    let index = 0;
    for (const item of theoryList) {
      throwIfRunAborted();
      index++;
      const { subject: subjectCode, teacher: teacherName } = item;

      log.subsection("", `Theory ${index}/${theoryList.length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      broadcast({ type: 'status_update', msg: `Theory ${index}/${theoryList.length}: ${subjectCode} — ${teacherName || 'N/A'}` });

      const result = await submitTheoryFeedback(page, subjectCode, teacherName, feedbackOption);

      if (result === true) {
        stats.totalSubmissions++;
        log.success(`[+] Completed\n`);
      } else if (result === 'skipped') {
        log.skip(`[>>] Skipped\n`);
      } else if (result === 'duplicate') {
        log.warning(`[!] Already submitted\n`);
      } else {
        log.error(`[x] Failed\n`);
      }

      await delay(300);
    }
  }

  // ============= LAB FEEDBACK =============
  broadcast(ip, { type: 'status_update', msg: 'PHASE: Lab Feedback' });
  if (labList.length > 0) {
    log.section("LAB FEEDBACK SUBMISSION");
    log.info(`${labList.length} lab subject(s) to process\n`);

    let index = 0;
    for (const item of labList) {
      throwIfRunAborted();
      index++;
      const { subject: subjectCode, teacher: teacherName } = item;

      log.subsection("", `Lab ${index}/${labList.length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      broadcast(ip, { type: 'status_update', msg: `Lab ${index}/${labList.length}: ${subjectCode} — ${teacherName || 'N/A'}` });

      const result = await submitLabFeedback(page, subjectCode, teacherName, feedbackOption);

      if (result === true) {
        stats.totalSubmissions++;
        log.success(`[+] Completed\n`);
      } else if (result === 'skipped') {
        log.skip(`[>>] Skipped\n`);
      } else if (result === 'duplicate') {
        log.warning(`[!] Already submitted\n`);
      } else {
        log.error(`[x] Failed\n`);
      }

      await delay(300);
    }
  }

  // ============= MENTOR FEEDBACK =============
  broadcast(ip, { type: 'status_update', msg: 'PHASE: Mentor Feedback' });
  if (mentorDept || mentorName) {
    log.section("MENTOR FEEDBACK SUBMISSION");
    log.info(`Dept: ${mentorDept || 'NOT PROVIDED'}, Name: ${mentorName || 'NOT PROVIDED'}`);
    broadcast(ip, { type: 'status_update', msg: `Mentor: ${mentorName || 'N/A'} (${mentorDept || 'N/A'})` });

    const result = await submitMentorFeedback(page, mentorDept, mentorName, feedbackOption);

    if (result === true) {
      stats.totalSubmissions++;
      log.success("[+] Completed\n");
    } else if (result === 'skipped') {
      log.skip("[>>] Skipped\n");
    } else if (result === 'duplicate') {
      log.warning("[!] Already submitted\n");
    } else {
      log.error("[x] Failed\n");
    }

    await delay(300);
  }

  // ============= TEACHING FEEDBACK =============
  broadcast(ip, { type: 'status_update', msg: 'PHASE: Teaching & Learning Feedback' });
  if (teachingList.length > 0) {
    log.section("TEACHING & LEARNING FEEDBACK");
    log.info(`${teachingList.length} teaching subject(s) to process\n`);

    let index = 0;
    for (const item of teachingList) {
      throwIfRunAborted();
      index++;
      const { subject: subjectCode, teacher: teacherName } = item;

      log.subsection("", `Teaching ${index}/${teachingList.length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      broadcast(ip, { type: 'status_update', msg: `Teaching ${index}/${teachingList.length}: ${subjectCode} — ${teacherName || 'N/A'}` });

      const result = await submitTeachingFeedback(page, subjectCode, teacherName, feedbackOption);

      if (result === true) {
        stats.totalSubmissions++;
        log.success(`Completed ✓\n`);
      } else if (result === 'skipped') {
        log.skip(`Skipped ⏭️\n`);
      } else if (result === 'duplicate') {
        log.warning(`Already exists ⚠️\n`);
      } else {
        log.error(`Failed ✗\n`);
      }

      await delay(1000);
    }
  }

  log.section("RETURNING TO DASHBOARD");

  if (IS_LOCAL) {
    await navigateToPage(page, 'dashboard');
  } else {
    await navigateToURL(page, URLS.production.dashboard, 'dashboard');
  }

  await delay(1000);
  log.success("Back on dashboard");

  // ============= COMPLETION SUMMARY =============
  stats.endTime = Date.now();
  const endTimestamp = getCurrentTimestamp();
  const duration = stats.endTime - stats.startTime;

  log.section("FEEDBACK SUBMISSION COMPLETE");

  console.log(`
  TIMING INFORMATION
  ${"=".repeat(70)}
  Start Time    : ${startTimestamp}
  End Time      : ${endTimestamp}
  Total Duration: ${formatDuration(duration)}

  EXECUTION SUMMARY
  ${"=".repeat(70)}
  [+] Successful : ${stats.totalSubmissions}
  [x] Failed     : ${stats.totalFailed}
  [>>] Skipped   : ${stats.totalSkipped}
  [!] Duplicates : ${stats.duplicateAttempts.length}
  Total Processed: ${stats.totalSubmissions + stats.totalFailed + stats.totalSkipped}

  BREAKDOWN BY CATEGORY:
  . Theory         : ${theoryList.length} configured
  . Lab            : ${labList.length} configured
  . Mentor         : ${mentorDept && mentorName ? '1' : '0'} configured
  . Teaching & Lrn : ${teachingList.length} configured
  ${"=".repeat(70)}
  `);

  broadcast(ip, {
    type: 'run_complete_summary',
    data: {
      success: stats.totalSubmissions,
      errors: stats.totalFailed,
      skipped: stats.totalSkipped,
      duplicates: stats.duplicateAttempts.length,
      duration: formatDuration(duration),
      startTime: startTimestamp,
      endTime: endTimestamp,
      breakdown: {
        theory: theoryList.length,
        lab: labList.length,
        mentor: mentorDept && mentorName ? 1 : 0,
        teaching: teachingList.length
      },
      skippedItems: stats.skippedItems,
      duplicateItems: stats.duplicateAttempts
    }
  });

  // Show skipped items in console
  if (stats.skippedItems.length > 0) {
    console.log(`\n  SKIPPED ITEMS (${stats.skippedItems.length})`);
    stats.skippedItems.forEach(item => {
      console.log(`    . ${item.category}: ${item.subject || 'N/A'} - ${item.reason}`);
    });
  }

  // Show duplicate attempts in console
  if (stats.duplicateAttempts.length > 0) {
    console.log(`\n  DUPLICATE FEEDBACK DETECTED (${stats.duplicateAttempts.length})`);
    stats.duplicateAttempts.forEach(item => {
      console.log(`    . ${item}`);
    });
  }

  log.success("Bot execution completed successfully");
  broadcast(ip, { type: 'status_update', msg: 'MISSION_ACCOMPLISHED' });
  log.info("Browser remaining open — use Logout & Exit in the dashboard to close");

  // Keep browser alive — user must explicitly logout
  // browser.close() is handled by /api/logout endpoint

  activeRun = null;
  });
}

// ============= WEB SERVER ENDPOINTS =============
app.post("/api/resume", (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  sessionContext.run(ip, () => {
    const session = getCurrentSession();
    if (session?.resumeResolve) {
      log.success("User signaled protocol resumption ✓");
      session.resumeResolve(req.body.captcha || null);
      session.resumeResolve = null;
      res.send({ status: "success", message: "Resuming..." });
    } else {
      res.status(400).send({ status: "error", message: "No pending action required for this session" });
    }
  });
});

app.post("/api/interact", async (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  const { action, x, y, key, text } = req.body;
  
  await sessionContext.run(ip, async () => {
    const session = getCurrentSession();
    if (!session?.activePage || isRunAborted()) {
      return res.status(400).send({ status: "error", message: "No active browser session" });
    }

    try {
      switch (action) {
        case 'click':
          await session.activePage.mouse.click(x, y, { delay: 50 });
          break;
        case 'type':
          await session.activePage.keyboard.type(text || key, { delay: 30 });
          break;
        case 'press':
          await session.activePage.keyboard.press(key);
          break;
        default:
          return res.status(400).send({ status: "error", message: "Invalid action" });
      }
      res.send({ status: "success" });
    } catch (err) {
      res.status(500).send({ status: "error", message: err.message });
    }
  });
});

app.post("/api/pause", (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  sessionContext.run(ip, () => {
    const session = getCurrentSession();
    if (!session?.stats?.startTime) {
      return res.status(400).send({ status: "error", message: "No active run" });
    }
    session.isPaused = true;
    log.info("Protocol PAUSED by user command");
    broadcast(ip, { type: 'status_update', msg: 'PROTOCOL_PAUSED' });
    res.send({ status: "success", isPaused: session.isPaused });
  });
});

app.post("/api/resume-protocol", (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  sessionContext.run(ip, () => {
    const session = getCurrentSession();
    if (!session?.stats?.startTime) {
      return res.status(400).send({ status: "error", message: "No active run" });
    }
    session.isPaused = false;
    log.info("Protocol RESUMED by user command");
    broadcast(ip, { type: 'status_update', msg: 'PROTOCOL_RESUMED' });
    res.send({ status: "success", isPaused: session.isPaused });
  });
});

app.post("/api/kill", async (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  await sessionContext.run(ip, async () => {
    const session = getCurrentSession();
    log.section("EMERGENCY KILL COMMAND RECEIVED");
    broadcast(ip, { type: 'status_update', msg: 'TERMINATING_ALL_PROCESSES' });
    broadcast(ip, { type: 'log', level: 'error', msg: 'Process terminated by user' });

    if (session?.activeRun?.abortController && !session.activeRun.abortController.signal.aborted) {
      session.activeRun.terminatedByUser = true;
      session.activeRun.abortController.abort();
    }
    if (session?.resumeResolve) {
      session.resumeResolve(null);
      session.resumeResolve = null;
    }
    if (session) session.isPaused = false;
    res.send({ status: "success", message: "Process terminated by user." });
  });
});

app.post("/api/request-preset", async (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  const { email, message, configData } = req.body;
  
  await sessionContext.run(ip, async () => {
    log.section("📬 PRESET REQUEST RECEIVED");
    log.info(`From: ${email}`);
    log.detail(`Details: ${message}`);
    
    // In a real scenario, this would send an actual email via nodemailer
    // For now, we log it to the backend and return success
    console.log("-----------------------------------------");
    console.log(`NEW PRESET REQUEST [${new Date().toISOString()}]`);
    console.log(`USER EMAIL: ${email}`);
    console.log(`MESSAGE: ${message}`);
    console.log(`PROVIDED CONFIG:\n${JSON.stringify(configData, null, 2)}`);
    console.log("-----------------------------------------");

    res.send({ status: "success", message: "Request transmitted to Mission Control support." });
  });
});

app.get("/api/stream", (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  
  const session = getOrCreateSession(ip);
  session.sseClients.push(newClient);

  sessionContext.run(ip, () => {
    log.info(`Remote client connected to stream [${clientId}]`);
  });

  req.on("close", () => {
    session.sseClients = session.sseClients.filter(c => c.id !== clientId);
    sessionContext.run(ip, () => {
      log.info(`Remote client disconnected [${clientId}]`);
    });
  });
});

app.post("/api/logout", async (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  await sessionContext.run(ip, async () => {
    const session = getCurrentSession();
    if (session?.activeBrowser) {
      try {
        await session.activeBrowser.close();
        log.info("Browser closed via logout");
      } catch (e) {
        log.warning(`Browser close error: ${e.message}`);
      }
    }
    broadcast(ip, { type: 'status_update', msg: 'PROCESS_COMPLETE' });
    await cleanupSession(ip);
    res.send({ status: "success", message: "Logged out and browser closed" });
  });
});

app.post("/api/execute", async (req, res) => {
  const ip = req.headers['x-session-id'] || req.query.sessionId || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'local';
  
  await sessionContext.run(ip, async () => {
    log.section("API EXECUTION TRIGGERED");
    const session = getCurrentSession();
    
    if (session.stats.startTime) {
      return res.status(400).send({ status: "error", message: "Bot is already running for this session" });
    }

    // Run the bot in the background with frontend inputs
    run(req.body, ip).catch(err => {
      if (err?.name === 'AbortError') {
        log.warning("Process terminated by user");
        broadcast(ip, { type: 'status_update', msg: 'PROCESS_TERMINATED' });
        return;
      }
      log.error(`API Runtime error: ${err.message}`);
      broadcast(ip, { type: 'log', level: 'error', msg: `Fatal Backend Error: ${err.message}` });
    }).finally(async () => {
      await cleanupSession(ip);
    });

    res.send({ 
      status: "success", 
      message: "Feedback automation protocol initiated.",
      timestamp: getCurrentTimestamp()
    });
  });
});

// ============= MAIN ENTRY POINT =============
async function startServer() {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m'
  };

  if (IS_LOCAL) {
    displayWelcomeBanner();
  }

  if (IS_LOCAL) {
    // Local mode uses a default 'local' session context
    sessionContext.run('local', async () => {
      const shouldStart = await getUserConfirmation();
      if (!shouldStart) {
        console.log("\n" + colors.red + "❌ Operation cancelled by user." + colors.reset);
        process.exit(0);
      }
      console.log("\n" + colors.green + colors.bright + "✅ Starting feedback automation..." + colors.reset + "\n");
      run().catch(err => log.error(err.message));
    });
  } else {
    app.listen(PORT, () => {
      console.log(`🚀 Production Server running on port ${PORT}`);
      console.log(`📡 Uplink Authorized: ${FRONTEND_URL}`);
    });
  }
}

startServer();

// Error handler for the main process
process.on('uncaughtException', (err) => {
  console.error("💥 SYSTEM-LEVEL FATAL ERROR:");
  console.error(err.stack);
  // In a multi-session environment, we try to keep the server alive unless it's a true system crash
});
