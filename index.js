import puppeteer from "puppeteer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

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
    `• Review the .env.example file for correct format`,
    `• After completion you can see the final logs`,
    `• You can check manually if having doubts`,
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

// ============= CONFIGURATION =============
const { 
  ENROLLMENT_NO, 
  PASSWORD, 
  FEEDBACK_OPTION, 
  MENTOR_DEPT, 
  MENTOR_NAME,
  THEORY_SUBJECTS,
  THEORY_TEACHERS,
  LAB_SUBJECTS,
  LAB_TEACHERS,
  TEACHING_SUBJECTS,
  TEACHING_TEACHERS,
  ENVIRONMENT // 'local' or 'production'
} = process.env;
// env
console.log("ENROLLMENT NO from env:", JSON.stringify(ENROLLMENT_NO));
console.log("PASSWORD length:", PASSWORD ? PASSWORD.length : 0);

// Validate required fields
if (!ENROLLMENT_NO || !PASSWORD || !FEEDBACK_OPTION) {
  throw new Error("❌ Missing required environment variables (ENROLLMENT NO, PASSWORD, FEEDBACK_OPTION)");
}

const IS_LOCAL = !ENVIRONMENT || ENVIRONMENT.toLowerCase() === 'local';

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

// Parse comma-separated lists from env
const parseEnvList = (str) => str ? str.split(",").map(s => s.trim()).filter(s => s) : [];

// Create subject-teacher mappings
const theorySubjects = parseEnvList(THEORY_SUBJECTS);
const theoryTeachers = parseEnvList(THEORY_TEACHERS);
const theoryMap = {};
theorySubjects.forEach((sub, idx) => {
  theoryMap[sub] = theoryTeachers[idx] || "";
});

const labSubjects = parseEnvList(LAB_SUBJECTS);
const labTeachers = parseEnvList(LAB_TEACHERS);
const labMap = {};
labSubjects.forEach((sub, idx) => {
  labMap[sub] = labTeachers[idx] || "";
});

const teachingSubjects = parseEnvList(TEACHING_SUBJECTS);
const teachingTeachers = parseEnvList(TEACHING_TEACHERS);
const teachingMap = {};
teachingSubjects.forEach((sub, idx) => {
  teachingMap[sub] = teachingTeachers[idx] || "";
});

// Track execution statistics
const stats = {
  startTime: null,
  endTime: null,
  totalSubmissions: 0,
  totalFailed: 0,
  totalSkipped: 0,
  skippedItems: [],
  missingEnvData: [],
  submittedFeedback: new Set(),
  duplicateAttempts: []
};

// ============= LOGGING UTILITIES =============
const log = {
  section: (title) => {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${"=".repeat(70)}\n`);
  },
  
  subsection: (emoji, text) => {
    console.log(`\n${emoji} ${text}`);
    console.log(`${"-".repeat(60)}`);
  },
  
  info: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}ℹ️  ${text}`);
  },
  
  success: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}✅ ${text}`);
  },
  
  error: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}❌ ${text}`);
  },
  
  warning: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}⚠️  ${text}`);
  },
  
  action: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}▶️  ${text}`);
  },
  
  detail: (text, indent = 2) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}• ${text}`);
  },
  
  scroll: (text, indent = 2) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}📜 ${text}`);
  },
  
  skip: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}⏭️  ${text}`);
  },
  
  time: (text, indent = 1) => {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}⏱️  ${text}`);
  }
};

// ============= UTILITY FUNCTIONS =============
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      log.success(`Loaded ${pageName}`);
    } catch (e) {
      log.error(`Failed to navigate to ${pageName}: ${e.message}`, 2);
      throw e;
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
    
    log.info(`📢 Alert: "${message}"`, 2);
    
    if (msgLower.includes('already submitted') || msgLower.includes('already given')) {
      log.warning("⚠️ Feedback already submitted", 2);
      await dialog.dismiss().catch(() => {});
    } else if (msgLower.includes('success') || msgLower.includes('submitted')) {
      log.success("✅ Submission confirmed!", 2);
      await dialog.accept().catch(() => {});
    } else {
      await dialog.accept().catch(() => {});
    }
  });
}

async function handleNetworkErrors(page) {
  page.on('requestfailed', request => {
    const url = request.url();

    // 🧹 Skip noisy external assets (fonts, CSS, images, etc.)
    if (
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('.css') ||
      url.includes('.png') ||
      url.includes('.jpg') ||
      url.includes('.jpeg') ||
      url.includes('.ico') ||
      url.includes('.svg')
    ) {
      return; // Ignore these
    }

    // Log only meaningful internal or API network failures
    log.error(`❌ Network request failed: ${url}`, 2);

    const failure = request.failure();
    if (failure) {
      log.detail(`Failure: ${failure.errorText}`);
    }
  });

  page.on('pageerror', error => {
    log.error(`Page error: ${error.message}`, 2);
  });
}

async function waitForSubmissionConfirmation(page, timeout = 8000) {
  log.action("Waiting for server response...", 2);

  try {
    const startTime = Date.now();
    let dialogReceived = false;
    let dialogResult = null;

    // Set up dialog handler
    const dialogHandler = async (dialog) => {
      dialogReceived = true;
      const msg = dialog.message();
      const msgLower = msg.toLowerCase();
      
      log.info(`📢 Alert: "${msg}"`, 2);

      if (msgLower.includes('already submitted') || msgLower.includes('already given')) {
        log.warning("⚠️ Feedback already submitted", 2);
        await dialog.dismiss().catch(() => {});
        dialogResult = 'duplicate';
      } else if (msgLower.includes('success') || msgLower.includes('submitted')) {
        log.success("✅ Submission confirmed!", 2);
        await dialog.accept().catch(() => {});
        dialogResult = 'success';
      } else if (msgLower.includes('error') || msgLower.includes('failed')) {
        log.error(`Submission error: ${msg}`, 2);
        await dialog.dismiss().catch(() => {});
        dialogResult = 'error';
      } else {
        log.warning(`Unknown alert: ${msg}`, 2);
        await dialog.accept().catch(() => {});
        dialogResult = 'unknown';
      }
    };

    page.once('dialog', dialogHandler);

    // Wait for dialog with timeout
    while (!dialogReceived && (Date.now() - startTime) < timeout) {
      await delay(200);
    }

    page.off('dialog', dialogHandler);

    if (dialogReceived) {
      log.detail(`Response received in ${Date.now() - startTime}ms`);
      return dialogResult;
    }

    // No dialog received - check for page changes
    log.warning("No confirmation dialog received", 2);
    
    // Wait a bit more for network activity
    try {
      await page.waitForNetworkIdle({ timeout: 2000, idleTime: 500 });
      log.detail("Network idle detected");
    } catch (e) {
      log.detail("Network still active");
    }

    return 'timeout';

  } catch (e) {
    log.error(`Confirmation error: ${e.message}`, 2);
    return 'error';
  }
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

async function findSubjectOption(page, selectId, subjectCode) {
  log.action(`Searching for subject: "${subjectCode}"`, 2);
  
  const result = await page.evaluate((id, code) => {
    const select = document.querySelector(id);
    if (!select) return { found: false, error: "Dropdown not found" };
    
    const options = Array.from(select.options);
    
    // Try exact match first
    let option = options.find(opt => 
      opt.value && opt.value.toUpperCase() === code.toUpperCase()
    );
    
    // Try partial match in value
    if (!option) {
      option = options.find(opt => 
        opt.value && opt.value.toUpperCase().includes(code.toUpperCase())
      );
    }
    
    // Try matching in text content
    if (!option) {
      option = options.find(opt => 
        opt.textContent && opt.textContent.toUpperCase().includes(code.toUpperCase())
      );
    }
    
    if (option) {
      return { 
        found: true, 
        value: option.value, 
        text: option.textContent.trim() 
      };
    }
    
    return { 
      found: false, 
      error: "Subject not found in dropdown",
      availableCount: options.length - 1
    };
  }, selectId, subjectCode);
  
  if (result.found) {
    log.success(`Found: "${result.text}"`, 2);
  } else {
    log.error(`${result.error} (${result.availableCount} options available)`, 2);
  }
  
  return result.found ? result : null;
}
async function checkForAlreadySubmittedAlert(page, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let alertDetected = false;
    let timeoutId = null;
    
    const handler = async (dialog) => {
      const msg = dialog.message().toLowerCase();
      if (msg.includes('already submitted') || msg.includes('already given')) {
        alertDetected = true;
        await dialog.dismiss().catch(() => {});
        log.info(`📢 Alert: "${dialog.message()}"`, 2);
        log.skip("⏭️ Skipping to next - feedback already submitted", 2);
        
        // Clear timeout and remove handler
        if (timeoutId) clearTimeout(timeoutId);
        page.off('dialog', handler);
        resolve(true);
      } else {
        // Not our alert, accept and continue
        await dialog.accept().catch(() => {});
      }
    };
    
    page.once('dialog', handler);
    
    timeoutId = setTimeout(() => {
      page.off('dialog', handler);
      resolve(alertDetected);
    }, timeoutMs);
  });
}
async function findTeacherOption(page, selectId, teacherName) {
  log.action(`Searching for teacher: "${teacherName}"`, 2);
  
  const result = await page.evaluate((id, name) => {
    const select = document.querySelector(id);
    if (!select) return { found: false, error: "Dropdown not found" };
    
    const options = Array.from(select.options);
    const nameParts = name.toLowerCase().trim().split(' ').filter(p => p);
    
    // Try exact match
    let option = options.find(opt => {
      if (!opt.value) return false;
      const optText = opt.textContent.toLowerCase();
      const optValue = opt.value.toLowerCase();
      return optText === name.toLowerCase() || optValue === name.toLowerCase();
    });
    
    // Try matching all name parts
    if (!option) {
      option = options.find(opt => {
        if (!opt.value) return false;
        const optText = opt.textContent.toLowerCase();
        const optValue = opt.value.toLowerCase();
        return nameParts.every(part => 
          optText.includes(part) || optValue.includes(part)
        );
      });
    }
    
    // Try matching any significant name part
    if (!option && nameParts.length > 0) {
      option = options.find(opt => {
        if (!opt.value) return false;
        const optText = opt.textContent.toLowerCase();
        const optValue = opt.value.toLowerCase();
        return nameParts.some(part => 
          part.length > 2 && (optText.includes(part) || optValue.includes(part))
        );
      });
    }
    
    if (option) {
      return { 
        found: true, 
        value: option.value, 
        text: option.textContent.trim() 
      };
    }
    
    return { 
      found: false, 
      error: "Teacher not found in dropdown",
      availableCount: options.length - 1
    };
  }, selectId, teacherName);
  
  if (result.found) {
    log.success(`Found: "${result.text}"`, 2);
  } else {
    log.error(`${result.error} (${result.availableCount} options available)`, 2);
  }
  
  return result.found ? result : null;
}

async function navigateToPage(page, pageName) {
  const url = IS_LOCAL ? null : URLS.production[pageName];
  await navigateToURL(page, url, pageName);
}

// ============= SUBMIT FORM FUNCTION =============
async function submitForm(page, selector) {
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

// ============= FEEDBACK SUBMISSION FUNCTIONS =============
async function submitTheoryFeedback(page, subjectCode, teacherName, feedbackOption) {
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
    log.error("Theory page did not load properly");
    stats.totalFailed++;
    return false;
  }

  const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);
  if (!subject) {
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Theory', subject: subjectCode, reason: 'Subject not found' });
    return false;
  }

  await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
  await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
  log.detail(`Selected: ${subject.text}`);
  await delay(1000);

  // Check for alert after subject selection
  const alertAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
  if (alertAfterSubject) {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate'; // SKIP EVERYTHING - return immediately
  }

  await delay(500);

  const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
  if (!teacher) {
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Theory', subject: subjectCode, reason: `Teacher not found` });
    return false;
  }

  await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
  await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
  log.detail(`Selected: ${teacher.text}`);
  await delay(1000);

  // Check for alert after teacher selection
  const alertAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
  if (alertAfterTeacher) {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate'; // SKIP EVERYTHING - return immediately
  }

  // Only reach here if NO duplicate alert
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await delay(800);

  const fillResult = await fillAllQuestions(page, feedbackOption);

  if (fillResult.total === 0) {
    log.warning("No questions found", 2);
    stats.totalFailed++;
    return false;
  }

  const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
  
  if (!submitSuccess) {
    log.error("Failed to click submit button", 2);
    stats.totalFailed++;
    return false;
  }

  const confirmResult = await waitForSubmissionConfirmation(page, 8000);

  if (confirmResult === 'success') {
    log.success("📊 Server confirmed: Data submitted successfully", 2);
    markFeedbackSubmitted('Theory Feedback', subject.text, teacherName);
    return true;
  }

  if (confirmResult === 'duplicate') {
    stats.duplicateAttempts.push(`Theory: ${subjectCode} - ${teacherName}`);
    return 'duplicate';
  }

  if (confirmResult === 'timeout' || confirmResult === 'unknown') {
    log.warning("No clear confirmation - submission may have succeeded", 2);
    markFeedbackSubmitted('Theory Feedback', subject.text, teacherName);
    return true;
  }

  stats.totalFailed++;
  return false;
}
async function submitLabFeedback(page, subjectCode, teacherName, feedbackOption) {
  if (!teacherName || teacherName.trim() === '') {
    log.skip(`Skipping ${subjectCode} - No teacher provided`);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: 'Missing teacher name' });
    return 'skipped';
  }
  
  try {
    await navigateToPage(page, 'lab');
    await page.waitForSelector('#ContentPlaceHolder1_ddlSubject', { visible: true, timeout: 5000 });
    
    await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
    const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);
    
    if (!subject) {
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: 'Subject not found' });
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
    log.detail(`Selected: ${subject.text}`);
    await delay(1000);
    
    const alertAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
    if (alertAfterSubject) {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // SKIP EVERYTHING
    }
    
    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
    
    if (!teacher) {
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Lab', subject: subjectCode, reason: `Teacher not found` });
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
    log.detail(`Selected: ${teacher.text}`);
    await delay(1000);
    
    const alertAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
    if (alertAfterTeacher) {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // SKIP EVERYTHING
    }
    
    // Only reach here if NO duplicate
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);
    
    const result = await fillAllQuestions(page, feedbackOption);
    
    if (result.total === 0) {
      log.warning("No questions found", 2);
      stats.totalFailed++;
      return false;
    }
    
    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    
    if (!submitSuccess) {
      stats.totalFailed++;
      return false;
    }

    const confirmResult = await waitForSubmissionConfirmation(page, 8000);

    if (confirmResult === 'success') {
      log.success("📊 Server confirmed: Data submitted successfully", 2);
      markFeedbackSubmitted('Lab Feedback', subject.text, teacherName);
      return true;
    }

    if (confirmResult === 'duplicate') {
      stats.duplicateAttempts.push(`Lab: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }
    
    if (confirmResult === 'timeout' || confirmResult === 'unknown') {
      log.warning("No clear confirmation - submission may have succeeded", 2);
      markFeedbackSubmitted('Lab Feedback', subject.text, teacherName);
      return true;
    }
    
    stats.totalFailed++;
    return false;
    
  } catch (e) {
    log.error(`Lab submission error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}
async function submitMentorFeedback(page, dept, name, feedbackOption) {
  if (!dept || !name) {
    log.skip('Skipping Mentor - Missing data');
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Mentor', reason: 'Missing department or name' });
    return 'skipped';
  }
  
  try {
    await navigateToPage(page, 'mentor');
    await page.waitForSelector('#ContentPlaceHolder1_ddldept', { visible: true, timeout: 5000 });
    
    log.action("Selecting mentor details...", 2);
    
    // Select department
    await scrollToElement(page, '#ContentPlaceHolder1_ddldept');
    
    const deptOptions = await page.evaluate((selectId) => {
      const select = document.querySelector(selectId);
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));
    }, '#ContentPlaceHolder1_ddldept');
    
    const deptMatch = deptOptions.find(opt => 
      opt.text.toLowerCase().includes(dept.toLowerCase()) ||
      opt.value.toLowerCase().includes(dept.toLowerCase())
    );
    
    if (!deptMatch) {
      log.error(`Department "${dept}" not found`, 2);
      stats.totalFailed++;
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddldept", deptMatch.value);
    log.detail(`Department: ${deptMatch.text}`);
    await delay(1500); // Wait for teacher dropdown to populate
    
    // Select mentor
    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    
    const teacherOptions = await page.evaluate((selectId) => {
      const select = document.querySelector(selectId);
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));
    }, '#ContentPlaceHolder1_ddlTeacherCode');
    
    const teacherMatch = teacherOptions.find(opt => {
      const nameParts = name.toLowerCase().split(' ').filter(p => p);
      const optText = opt.text.toLowerCase();
      return nameParts.some(part => optText.includes(part));
    });
    
    if (!teacherMatch) {
      log.error(`Mentor "${name}" not found`, 2);
      stats.totalFailed++;
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacherMatch.value);
    log.detail(`Mentor: ${teacherMatch.text}`);
    await delay(1000);
    
    const alertAfterSelection = await checkForAlreadySubmittedAlert(page, 1500);
    if (alertAfterSelection) {
      log.skip("⏭️ Already submitted - skipping", 2);
      return 'duplicate';
    }
    
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);
    
    const result = await fillAllQuestions(page, feedbackOption);
    
    if (result.total === 0) {
      log.warning("No questions found", 2);
    }

    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    
    if (!submitSuccess) {
      log.error("Failed to submit mentor feedback", 2);
      stats.totalFailed++;
      return false;
    }

    const confirmResult = await waitForSubmissionConfirmation(page, 8000);

    if (confirmResult === 'duplicate') {
      stats.duplicateAttempts.push(`Mentor: ${name} (${dept})`);
      return 'duplicate';
    }

    if (confirmResult === 'success') {
      log.success("📊 Server response: Data submitted successfully", 2);
      markFeedbackSubmitted('Mentor Feedback', dept, name);
      return true;
    }

    if (confirmResult === 'timeout') {
      return true;
    }

    return false;
    
  } catch (e) {
    log.error(`Mentor submission error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}
async function submitTeachingFeedback(page, subjectCode, teacherName, feedbackOption) {
  if (!teacherName || teacherName.trim() === '') {
    log.skip(`Skipping ${subjectCode} - No teacher provided`);
    stats.totalSkipped++;
    stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: 'Missing teacher name' });
    return 'skipped';
  }
  
  try {
    await navigateToPage(page, 'teaching');
    await page.waitForSelector('#ContentPlaceHolder1_ddlSubject', { visible: true, timeout: 5000 });
    
    await scrollToElement(page, '#ContentPlaceHolder1_ddlSubject');
    const subject = await findSubjectOption(page, '#ContentPlaceHolder1_ddlSubject', subjectCode);

    if (!subject) {
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: 'Subject not found' });
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddlSubject", subject.value);
    log.detail(`Selected: ${subject.text}`);
    await delay(1000);
    
    const alertAfterSubject = await checkForAlreadySubmittedAlert(page, 1500);
    if (alertAfterSubject) {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // SKIP EVERYTHING
    }
    
    await scrollToElement(page, '#ContentPlaceHolder1_ddlTeacherCode');
    const teacher = await findTeacherOption(page, '#ContentPlaceHolder1_ddlTeacherCode', teacherName);
    
    if (!teacher) {
      stats.totalSkipped++;
      stats.skippedItems.push({ category: 'Teaching', subject: subjectCode, reason: `Teacher not found` });
      return false;
    }
    
    await page.select("#ContentPlaceHolder1_ddlTeacherCode", teacher.value);
    log.detail(`Selected: ${teacher.text}`);
    await delay(1000);
    
    const alertAfterTeacher = await checkForAlreadySubmittedAlert(page, 1500);
    if (alertAfterTeacher) {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate'; // SKIP EVERYTHING
    }
    
    // Only reach here if NO duplicate
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await delay(800);
    
    const result = await fillAllQuestions(page, feedbackOption);
    
    if (result.total === 0) {
      log.warning("No questions found", 2);
      stats.totalFailed++;
      return false;
    }
    
    const submitSuccess = await submitForm(page, '#ContentPlaceHolder1_btn_Submit');
    
    if (!submitSuccess) {
      log.error("Failed to submit teaching feedback", 2);
      stats.totalFailed++;
      return false;
    }

    const confirmResult = await waitForSubmissionConfirmation(page, 8000);

    if (confirmResult === 'success') {
      log.success("📊 Server confirmed: Data submitted successfully", 2);
      markFeedbackSubmitted('Teaching & Learning Feedback', subject.text, teacherName);
      return true;
    }

    if (confirmResult === 'duplicate') {
      stats.duplicateAttempts.push(`Teaching: ${subjectCode} - ${teacherName}`);
      return 'duplicate';
    }

    if (confirmResult === 'timeout' || confirmResult === 'unknown') {
      log.warning("No clear confirmation - submission may have succeeded", 2);
      markFeedbackSubmitted('Teaching & Learning Feedback', subject.text, teacherName);
      return true;
    }

    stats.totalFailed++;
    return false;
    
  } catch (e) {
    log.error(`Teaching submission error: ${e.message}`, 2);
    stats.totalFailed++;
    return false;
  }
}

// ============= MAIN EXECUTION =============
async function run() {
  stats.startTime = Date.now();
  const startTimestamp = getCurrentTimestamp();
  
  log.section("🤖 FEEDBACK AUTOMATION BOT STARTED");
  log.time(`Start Time: ${startTimestamp}`);
  log.info("Configuration loaded successfully");
  log.detail(`Mode: ${IS_LOCAL ? 'LOCAL (Testing)' : 'PRODUCTION (Live Site)'}`);
  log.detail(`Username: ${ENROLLMENT_NO}`);
  log.detail(`Feedback Option: ${FEEDBACK_OPTION}`);
  log.detail(`Theory Subjects: ${Object.keys(theoryMap).length}`);
  log.detail(`Lab Subjects: ${Object.keys(labMap).length}`);
  log.detail(`Teaching Subjects: ${Object.keys(teachingMap).length}`);
  log.detail(`Mentor Feedback: ${MENTOR_DEPT && MENTOR_NAME ? 'Yes' : 'No'}`);
  
  log.section("🌐 LAUNCHING BROWSER");
  const browser = await puppeteer.launch({ 
    headless: false,
    slowMo: 30,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    defaultViewport: null
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
//   page.on('dialog', async dialog => {
//   const msg = dialog.message().toLowerCase();
//   if (msg.includes('already submitted')) {
//     log.warning('Detected already-submitted alert globally', 2);
//     await dialog.dismiss().catch(() => {});
//   }
// });
  handleNetworkErrors(page);
  log.success("Browser launched successfully");

  // ============= LOGIN =============
  log.section("🔐 AUTHENTICATION");
  
  log.action("Opening login page...");
  log.detail(`URL: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await delay(800);
  log.success("Login page loaded");
  
  log.action("Entering credentials...");

    // Find the actual input field selectors
    const loginFields = await findLoginFields(page);

    if (!loginFields.enrollmentSelector || !loginFields.passwordSelector) {
    log.error("Could not find login input fields");
    throw new Error("Login form fields not found on page");
    }

    log.detail(`Enrollment field: ${loginFields.enrollmentSelector}`);
    log.detail(`Password field: ${loginFields.passwordSelector}`);

    await scrollToElement(page, loginFields.enrollmentSelector, false);
    await page.type(loginFields.enrollmentSelector, ENROLLMENT_NO, { delay: 30 });
    log.detail("Enrollment number entered");

    await scrollToElement(page, loginFields.passwordSelector, false);
    await page.type(loginFields.passwordSelector, PASSWORD, { delay: 30 });
    log.detail("Password entered");
  
// Replace the loginButtonSelector code block (around line 1044-1076) with this:

log.action("Submitting login form...");

// Find the login button dynamically
const loginButtonSelector = await page.evaluate(() => {
  // Try multiple possible selectors
  let btn = document.querySelector('input[value="LOGIN"]') ||
            document.querySelector('input[value="Login"]') ||
            document.querySelector('button[type="submit"]') ||
            document.querySelector('input[type="submit"]');
  
  // Try finding button by text content - FIXED VERSION
  if (!btn) {
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    btn = buttons.find(b => {
      const text = (b.textContent || b.value || '').trim().toUpperCase();
      return text === 'LOGIN' || text === 'LOG IN' || text === 'SUBMIT';
    });
  }
  
  if (btn) {
    // Return a reliable selector
    if (btn.id) return `#${btn.id}`;
    if (btn.name) return `[name="${btn.name}"]`;
    if (btn.type === 'submit') return 'input[type="submit"]';
    if (btn.className) {
      const classes = btn.className.trim().split(/\s+/);
      if (classes[0]) return `.${classes[0]}`;
    }
    // Last resort - return tag name
    return btn.tagName.toLowerCase();
  }
  return null;
});

if (!loginButtonSelector) {
  log.error("Could not find LOGIN button");
  throw new Error("Login button not found on page");
}

log.detail(`Login button found: ${loginButtonSelector}`);

if (IS_LOCAL) {
  // Local: Just click and navigate with JavaScript
  await page.click(loginButtonSelector);
  await delay(2000);
  
  await page.evaluate(() => {
    if (typeof showPage === 'function') {
      showPage('dashboard');
    }
  });
  await delay(1000);
} else {
  // Production: Click and wait for page navigation
  await Promise.all([
    page.click(loginButtonSelector),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
      log.warning("Navigation timeout, continuing...", 2);
    })
  ]);
  await delay(1500);
}
  
  await ensurePageVisible(page);
  log.success("Login successful! ✓");

  // ============= DASHBOARD =============
  log.section("📊 DASHBOARD");
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
    log.section("📋 CHECKING AVAILABLE OPTIONS");
    
    await navigateToPage(page, 'theory');
    await page.waitForSelector('#theorySubject', { timeout: 3000 }).catch(() => {});
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
  log.section("📍 STARTING FEEDBACK SUBMISSION");
  
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
  }

  // specifically detect Teaching & Learning link
  const teachLink = links.find(l =>
    l.text.toLowerCase().includes('teaching') ||
    l.id.toLowerCase().includes('teaching')
  );

  if (teachLink) {
    log.success(`Teaching & Learning link detected: ${teachLink.text}`, 2);

    // click it once to ensure session unlock
    await page.click(`#${teachLink.id}`);
    await delay(1500);

    log.success("Teaching & Learning page opened via link click ✓", 2);
    // go back to feedback page to continue sequence
    await page.goto(URLS.production.feedbackOptions, { waitUntil: 'domcontentloaded' });
    await delay(800);
  } else {
    log.warning("Teaching & Learning link not found in current DOM", 2);
  }
} catch (err) {
  log.error(`Teaching link detection error: ${err.message}`, 2);
}

  // ============= THEORY FEEDBACK =============
  if (Object.keys(theoryMap).length > 0) {
    log.section("📘 THEORY FEEDBACK SUBMISSION");
    log.info(`${Object.keys(theoryMap).length} theory subject(s) to process\n`);
    
    let index = 0;
    for (const [subjectCode, teacherName] of Object.entries(theoryMap)) {
      index++;
      
      log.subsection("📝", `Theory ${index}/${Object.keys(theoryMap).length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      
      const result = await submitTheoryFeedback(page, subjectCode, teacherName, FEEDBACK_OPTION);
      
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
      
      await delay(1000); // Longer delay between submissions
    }
  }

  // ============= LAB FEEDBACK =============
  if (Object.keys(labMap).length > 0) {
    log.section("🧪 LAB FEEDBACK SUBMISSION");
    log.info(`${Object.keys(labMap).length} lab subject(s) to process\n`);
    
    let index = 0;
    for (const [subjectCode, teacherName] of Object.entries(labMap)) {
      index++;
      
      log.subsection("📝", `Lab ${index}/${Object.keys(labMap).length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      
      const result = await submitLabFeedback(page, subjectCode, teacherName, FEEDBACK_OPTION);
      
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

  // ============= MENTOR FEEDBACK =============
  if (MENTOR_DEPT || MENTOR_NAME) {
    log.section("👨‍🏫 MENTOR FEEDBACK SUBMISSION");
    log.info(`Dept: ${MENTOR_DEPT || 'NOT PROVIDED'}, Name: ${MENTOR_NAME || 'NOT PROVIDED'}`);
    
    const result = await submitMentorFeedback(page, MENTOR_DEPT, MENTOR_NAME, FEEDBACK_OPTION);
    
    if (result === true) {
      stats.totalSubmissions++;
      log.success("Completed ✓\n");
    } else if (result === 'skipped') {
      log.skip("Skipped ⏭️\n");
    } else if (result === 'duplicate') {
      log.warning("Already exists ⚠️\n");
    } else {
      log.error("Failed ✗\n");
    }
    
    await delay(1000);
  }

  // ============= TEACHING FEEDBACK =============
  if (Object.keys(teachingMap).length > 0) {
    log.section("📖 TEACHING & LEARNING FEEDBACK");
    log.info(`${Object.keys(teachingMap).length} teaching subject(s) to process\n`);
    
    let index = 0;
    for (const [subjectCode, teacherName] of Object.entries(teachingMap)) {
      index++;
      
      log.subsection("📝", `Teaching ${index}/${Object.keys(teachingMap).length}: ${subjectCode}`);
      log.info(`Teacher: ${teacherName || 'NOT PROVIDED'}`);
      
      const result = await submitTeachingFeedback(page, subjectCode, teacherName, FEEDBACK_OPTION);
      
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

  // ============= RETURN TO DASHBOARD =============
  log.section("🏠 RETURNING TO DASHBOARD");
  
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
  
  log.section("🎉 FEEDBACK SUBMISSION COMPLETE");
  
  console.log(`
  ⏱️  TIMING INFORMATION
  ${"-".repeat(70)}
  Start Time:              ${startTimestamp}
  End Time:                ${endTimestamp}
  Total Duration:          ${formatDuration(duration)}
  
  📊 EXECUTION SUMMARY
  ${"-".repeat(70)}
  ✅ Successful Submissions:  ${stats.totalSubmissions}
  ❌ Failed Submissions:      ${stats.totalFailed}
  ⏭️  Skipped Items:           ${stats.totalSkipped}
  📋 Total Forms Processed:   ${stats.totalSubmissions + stats.totalFailed + stats.totalSkipped}
  
  BREAKDOWN BY CATEGORY:
  • Theory Subjects:          ${Object.keys(theoryMap).length} configured
  • Lab Subjects:             ${Object.keys(labMap).length} configured
  • Mentor Feedback:          ${MENTOR_DEPT && MENTOR_NAME ? '1' : '0'} configured
  • Teaching & Learning:      ${Object.keys(teachingMap).length} configured
  ${"-".repeat(70)}
  `);
  
  // Show missing env data
  if (stats.missingEnvData.length > 0) {
    console.log(`\n  ⚠️  MISSING ENVIRONMENT DATA (${stats.missingEnvData.length} items)`);
    console.log(`  ${"-".repeat(68)}`);
    stats.missingEnvData.forEach(item => {
      console.log(`    • ${item}`);
    });
    console.log(`  ${"-".repeat(68)}`);
  }
  
  // Show skipped items
  if (stats.skippedItems.length > 0) {
    console.log(`\n  ⏭️  SKIPPED ITEMS (${stats.skippedItems.length} items)`);
    console.log(`  ${"-".repeat(68)}`);
    stats.skippedItems.forEach(item => {
      console.log(`    • ${item.category}: ${item.subject || 'N/A'} - ${item.reason}`);
    });
    console.log(`  ${"-".repeat(68)}`);
  }
  
  // Show duplicate attempts
  if (stats.duplicateAttempts.length > 0) {
    console.log(`\n  🔄 DUPLICATE FEEDBACK DETECTED (${stats.duplicateAttempts.length} items)`);
    console.log(`  ${"-".repeat(68)}`);
    console.log(`    Already submitted - skipped to avoid duplicates:`);
    stats.duplicateAttempts.forEach(item => {
      console.log(`    • ${item}`);
    });
    console.log(`  ${"-".repeat(68)}`);
  }
  
  // Show available subjects not in .env
  if (missingTheorySubjects.length > 0) {
    console.log(`\n  📚 AVAILABLE SUBJECTS NOT IN .env (${missingTheorySubjects.length} theory subjects)`);
    console.log(`  ${"-".repeat(68)}`);
    console.log(`    Add these to your .env file if you want to submit feedback:`);
    missingTheorySubjects.forEach(sub => {
      console.log(`    • ${sub.value} - ${sub.text}`);
    });
    console.log(`  ${"-".repeat(68)}`);
  }
  
  console.log(`\n${"=".repeat(70)}\n`);
  
  log.success("✅ Bot execution completed successfully!");
  log.info("🌐 Browser will remain open for 5 seconds for verification");
  log.info("📊 Check the page for submitted responses\n");
  
  // Wait before closing
  await delay(5000);
  
  // Close browser in production mode
  if (!IS_LOCAL) {
    log.info("🔒 Closing browser...");
    await browser.close();
    log.success("Browser closed successfully");
  } else {
    log.info("🔴 Close the browser manually when done (LOCAL MODE)\n");
  }
}

// ============= MAIN ENTRY POINT =============
(async function main() {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m'
  };

  // Display welcome banner
  displayWelcomeBanner();
  
  // Get user confirmation
  const shouldStart = await getUserConfirmation();
  
  if (!shouldStart) {
    console.log("\n" + colors.red + "❌ Operation cancelled by user." + colors.reset);
    console.log(colors.cyan + "👋 Thanks for using Feedback Bot. Goodbye!" + colors.reset + "\n");
    process.exit(0);
  }
  
  console.log("\n" + colors.green + colors.bright + "✅ Starting feedback automation..." + colors.reset + "\n");
  
  // Start the bot
  run().catch(err => {
    stats.endTime = Date.now();
    const endTimestamp = getCurrentTimestamp();
    const duration = stats.endTime - stats.startTime;
    
    log.section("💥 FATAL ERROR OCCURRED");
    log.error(`Error Message: ${err.message}`);
    
    if (stats.startTime) {
      log.time(`Started at: ${getCurrentTimestamp()}`);
      log.time(`Failed at: ${endTimestamp}`);
      log.time(`Duration before failure: ${formatDuration(duration)}`);
    }
    
    console.error("\n📋 Stack Trace:");
    console.error(err.stack);
    console.log("\n" + "=".repeat(70) + "\n");
    process.exit(1);
  });
})();