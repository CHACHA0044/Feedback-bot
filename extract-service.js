import sharp from "sharp";
import Tesseract from "tesseract.js";

/**
 * Validates and sanitizes an uploaded base64 image against malicious image attacks:
 * 1. Validates base64 string structure & max buffer size (15MB)
 * 2. Validates binary magic bytes (JPEG, PNG, WebP only)
 * 3. Enforces pixel count limit (40M max) to prevent decompression / pixel bombs
 * 4. Re-encodes image through Sharp to strip all EXIF, metadata, and polyglot payloads
 */
export async function validateAndSanitizeImage(base64Str, label = "Image") {
  if (!base64Str || typeof base64Str !== "string") {
    throw new Error(`${label}: No image data received or invalid format.`);
  }

  const cleanBase64 = base64Str.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  if (buffer.length === 0) {
    throw new Error(`${label}: Uploaded file is empty.`);
  }

  const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
  if (buffer.length > MAX_SIZE) {
    throw new Error(`${label}: File size exceeds safety limit of 15MB.`);
  }

  // Check magic bytes / signatures
  // JPEG: FF D8 FF
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  // WebP: 52 49 46 46 (RIFF) + 57 45 42 50 (WEBP)
  const isJpeg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error(`${label}: Security Alert - Untrusted file header. Only genuine JPEG, PNG, or WebP images are permitted.`);
  }

  // Sanitize via Sharp: decode pixel matrix, strip EXIF / XMP / IPTC / script appendages
  try {
    const sanitizedBuffer = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .png({ compressionLevel: 8 })
      .toBuffer();

    return sanitizedBuffer;
  } catch (err) {
    throw new Error(`${label}: Security Alert - Corrupted image structure or decompression bomb detected: ${err.message}`);
  }
}

/**
 * Clean text strings to prevent reflected XSS or injection
 */
export function sanitizeString(str) {
  if (!str) return "";
  return str.replace(/[^a-zA-Z0-9\s.,&()/-]/g, "").trim().replace(/\s+/g, " ");
}

const SYSTEM_PROMPT = `You are an expert college academic schedule parser.
I have uploaded screenshots of a college student's Attendance page and Time Table page(s).

Rules:
1. Parse the Attendance page:
   - Identify all course subjects. Extract Subject Code (e.g. CG401, CS410, CS412, CS415, CS418, CS486, CS421, CS424), Subject Name, and Type.
   - Strictly classify Theory subjects as 'theory' (marked with '( T )' or 'Theory').
   - Strictly classify Practical / Lab subjects as 'lab' (marked with '( P )' or 'Practical').
   - Omit 'Library Attendance' or non-graded entries.
   - If a subject in attendance has 'No Classes' (e.g. CS300) and does not appear on the timetable, omit it or set teachers to empty array.

2. Parse the Time Table page(s):
   - Cells contain: [SubjectCode] / [Class/Section] / [(Optional Group)] / [Teacher Name] / [(Optional Room)].
   - Only associate a teacher with a subject code if that teacher is explicitly listed in a timetable cell with THAT code.
   - If a lab subject has 2 teachers in the timetable (e.g. CS424 with Ambreen Anees and Riajuddin Khan), list both teachers in the array.
   - If a theory subject has 2 teachers (e.g. CG401 with Ayaz Mahmood and Dr. Sufia Rehman), list both teachers in the array.
   - If NO teacher is found in the timetable for a subject, leave teachers as an empty array: []. DO NOT invent or guess dummy names like 'Lab Engineer' or 'Instructor'.

3. Output ONLY valid JSON in this exact structure:
{
  "theory": [
    { "code": "CG401", "name": "Career Development Course", "teachers": ["Ayaz Mahmood", "Dr. Sufia Rehman"] },
    { "code": "CS410", "name": "Distributed Systems", "teachers": ["Saman Khan"] }
  ],
  "lab": [
    { "code": "CS421", "name": "Minor Project", "teachers": ["Mohd Anas Khan"] },
    { "code": "CS424", "name": "SciLab", "teachers": ["Ambreen Anees", "Riajuddin Khan"] }
  ],
  "groupsDetected": ["Group 1", "Group 2"]
}`;

/**
 * Gemini Vision API
 */
async function extractWithGemini(attendanceBuf, timetableBufs, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const contents = [
    {
      parts: [
        { text: SYSTEM_PROMPT },
        {
          inline_data: {
            mime_type: "image/png",
            data: attendanceBuf.toString("base64")
          }
        },
        ...timetableBufs.map(buf => ({
          inline_data: {
            mime_type: "image/png",
            data: buf.toString("base64")
          }
        }))
      ]
    }
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response generated by Gemini Vision.");
  }

  return JSON.parse(text);
}

/**
 * OpenAI / Groq / OpenRouter Vision API (OpenAI Compatible)
 */
async function extractWithOpenAICompatible(attendanceBuf, timetableBufs, apiKey, baseUrl = "https://api.openai.com/v1", model = "gpt-4o-mini") {
  const content = [
    { type: "text", text: SYSTEM_PROMPT },
    {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${attendanceBuf.toString("base64")}` }
    },
    ...timetableBufs.map(buf => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${buf.toString("base64")}` }
    }))
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const contentText = result?.choices?.[0]?.message?.content;
  if (!contentText) {
    throw new Error("No response returned from Vision API.");
  }

  return JSON.parse(contentText);
}

/**
 * Anthropic Claude Vision API
 */
async function extractWithAnthropic(attendanceBuf, timetableBufs, apiKey) {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: SYSTEM_PROMPT },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: attendanceBuf.toString("base64")
          }
        },
        ...timetableBufs.map(buf => ({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: buf.toString("base64")
          }
        }))
      ]
    }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const text = result?.content?.[0]?.text;
  if (!text) {
    throw new Error("No response returned from Anthropic Claude.");
  }

  // Parse JSON from output
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from Claude response.");
  return JSON.parse(jsonMatch[0]);
}

/**
 * Built-in High-Precision OCR Extraction using Sharp + Tesseract
 */
async function extractWithTesseract(attendanceBuf, timetableBufs) {
  // Preprocess Attendance image
  const preppedAtt = await sharp(attendanceBuf)
    .resize({ width: 2600, fit: "inside" })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const { data: { text: attRaw } } = await Tesseract.recognize(preppedAtt, "eng");

  // Preprocess & OCR Timetable images
  let ttCombinedRaw = "";
  for (let i = 0; i < timetableBufs.length; i++) {
    const preppedTt = await sharp(timetableBufs[i])
      .resize({ width: 2800, fit: "inside" })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    const { data: { text: ttText } } = await Tesseract.recognize(preppedTt, "eng");
    ttCombinedRaw += "\n--- SEGMENT " + (i + 1) + " ---\n" + ttText;
  }

  // Standard Subject Catalog
  const subjectCatalog = [
    { code: "CG401", name: "Career Development Course", type: "theory", keywords: ["career", "cg401", "cg40"] },
    { code: "CS410", name: "Distributed Systems", type: "theory", keywords: ["distributed", "cs410", "c5410"] },
    { code: "CS412", name: "Cryptography and Network Security", type: "theory", keywords: ["cryptography", "network security", "cs412", "c5412"] },
    { code: "CS415", name: "Fuzzy Logic & Neural Networks", type: "theory", keywords: ["fuzzy", "neural", "cs415", "c5415"] },
    { code: "CS417", name: "Mobile Computing", type: "theory", keywords: ["mobile", "cs417", "c5417"] },
    { code: "CS418", name: "Data Warehousing & Data Mining", type: "theory", keywords: ["warehousing", "data mining", "cs418", "c5418"] },
    { code: "CS419", name: "Pattern Recognition", type: "theory", keywords: ["pattern", "cs419", "c5419"] },
    { code: "CS486", name: "Cloud Security", type: "theory", keywords: ["cloud", "cs486", "c5486"] },
    { code: "CS421", name: "Minor Project", type: "lab", keywords: ["minor project", "project", "cs421", "c5421"] },
    { code: "CS424", name: "SciLab", type: "lab", keywords: ["scilab", "chab", "cs424", "c5424"] },
    { code: "CG302", name: "Soft Skills", type: "theory", keywords: ["soft skills", "cg302"] },
    { code: "CS305", name: "Compiler Design", type: "theory", keywords: ["compiler", "cs305"] },
    { code: "CS306", name: "Compiler Design Lab", type: "lab", keywords: ["compiler lab", "cs306"] },
    { code: "CS313", name: "Web Technologies", type: "theory", keywords: ["web tech", "cs313"] },
    { code: "CS314", name: "Web Technologies Lab", type: "lab", keywords: ["web tech lab", "cs314"] },
    { code: "CS315", name: "Computer Networks", type: "theory", keywords: ["computer net", "cs315"] },
    { code: "CS348", name: "Design & Analysis of Algorithms", type: "theory", keywords: ["algorithm", "cs348"] },
    { code: "CS394", name: "Data Science with Python", type: "theory", keywords: ["python", "cs394"] },
    { code: "CS396", name: "Data Science with Python Lab", type: "lab", keywords: ["python lab", "cs396"] },
    { code: "EC339", name: "Digital Signal Processing", type: "theory", keywords: ["signal", "dsp", "ec339"] }
  ];

  // Faculty Directory with their strict respective subject associations
  const facultyList = [
    { name: "Ayaz Mahmood", code: "CG401" },
    { name: "Dr. Sufia Rehman", code: "CG401" },
    { name: "Saman Khan", code: "CS410" },
    { name: "Imtiyazul Haq", code: "CS412" },
    { name: "Dr. Faiyaz Ahamad", code: "CS415" },
    { name: "Mariyam Fatima", code: "CS418" },
    { name: "Abhishek Pandey", code: "CS486" },
    { name: "Mohd Anas Khan", code: "CS417" },
    { name: "Ambreen Anees", code: "CS424" },
    { name: "Riajuddin Khan", code: "CS424" },
    { name: "Bushra Fatima", code: "CS419" },
    { name: "Mohd Anas Khan", code: "CS421" }, // Specific project guide
    { name: "Falak Alam", code: "CS306" },
    { name: "Mohammad Aman", code: "CS306" },
    { name: "Naziya Anjum", code: "CS314" },
    { name: "Mr. Sunil Singh", code: "CS396" }
  ];

  // 1. Parse Attendance specifically for courses
  const attLower = attRaw.toLowerCase();
  const matchedSubjects = [];

  for (const item of subjectCatalog) {
    // Check if keyword appears in attendance text
    const isPresent = item.keywords.some(kw => attLower.includes(kw));
    if (isPresent) {
      // Exclude CS300 if attendance says no classes
      if (item.code === "CS300" && (attLower.includes("no classes") || attLower.includes("n/a"))) {
        continue;
      }
      matchedSubjects.push(item);
    }
  }

  // 2. Search Timetable PRECISELY for each subject code
  const ttLower = ttCombinedRaw.toLowerCase();
  const theoryResult = [];
  const labResult = [];

  for (const sub of matchedSubjects) {
    const code = sub.code;
    const teachersFound = new Set();

    // Specific search for faculty linked to THIS code in the timetable
    const potentialFaculty = facultyList.filter(f => f.code === code);
    for (const f of potentialFaculty) {
      const nameParts = f.name.toLowerCase().split(" ");
      const firstName = nameParts[0].replace(/^dr\.?|^mr\.?|^ms\.?|^mrs\.?/i, "").trim();
      const lastName = nameParts[nameParts.length - 1];

      // Check if code exists in timetable and this faculty's name appears
      const codeRegex = new RegExp(`${code}[\\s\\S]{0,180}?(?=(?:CG|CS|EC|CA)\\d{3}|$)`, "gi");
      let m;
      let matchedInCell = false;
      while ((m = codeRegex.exec(ttCombinedRaw)) !== null) {
        const snippet = m[0].toLowerCase();
        if (
          snippet.includes(f.name.toLowerCase()) ||
          (lastName.length > 3 && snippet.includes(lastName)) ||
          (firstName.length > 3 && snippet.includes(firstName))
        ) {
          teachersFound.add(f.name);
          matchedInCell = true;
        }
      }

      // Secondary check: code is present in timetable and teacher name appears in timetable text
      if (!matchedInCell && ttLower.includes(code.toLowerCase())) {
        if (ttLower.includes(f.name.toLowerCase()) || (lastName.length > 3 && ttLower.includes(lastName))) {
          teachersFound.add(f.name);
        }
      }
    }

    const teacherArray = Array.from(teachersFound);

    // If teacher doesn't exist, leave teacherArray as empty [] (DO NOT put dummy names!)
    if (sub.type === "theory") {
      theoryResult.push({
        code: sub.code,
        name: sub.name,
        teachers: teacherArray // empty [] if not found
      });
    } else {
      // lab
      labResult.push({
        code: sub.code,
        name: sub.name,
        teachers: teacherArray // empty [] if not found
      });
    }
  }

  return {
    theory: theoryResult,
    lab: labResult,
    groupsDetected: ["Group 1", "Group 2"]
  };
}

/**
 * Main coordinator for extracting presets
 */
export async function processScreenshotExtraction({ attendanceImage, timetableImages, aiProvider, apiKey }) {
  // 1. Security validate and sanitize images
  const sanitizedAttendance = await validateAndSanitizeImage(attendanceImage, "Attendance Page");

  if (!Array.isArray(timetableImages) || timetableImages.length === 0) {
    throw new Error("Time Table: At least one time table screenshot is required.");
  }
  if (timetableImages.length > 3) {
    throw new Error("Time Table: A maximum of 3 screenshots are permitted.");
  }

  const sanitizedTimetables = [];
  for (let i = 0; i < timetableImages.length; i++) {
    sanitizedTimetables.push(await validateAndSanitizeImage(timetableImages[i], `Time Table Segment ${i + 1}`));
  }

  // 2. Perform Extraction based on selected AI Provider or local OCR
  let parsedResult;
  const provider = (aiProvider || "gemini").toLowerCase();

  try {
    if (apiKey && provider === "gemini") {
      parsedResult = await extractWithGemini(sanitizedAttendance, sanitizedTimetables, apiKey);
    } else if (apiKey && (provider === "openai" || provider === "gpt")) {
      parsedResult = await extractWithOpenAICompatible(sanitizedAttendance, sanitizedTimetables, apiKey, "https://api.openai.com/v1", "gpt-4o-mini");
    } else if (apiKey && provider === "groq") {
      parsedResult = await extractWithOpenAICompatible(sanitizedAttendance, sanitizedTimetables, apiKey, "https://api.groq.com/openai/v1", "llama-3.2-11b-vision-preview");
    } else if (apiKey && provider === "anthropic") {
      parsedResult = await extractWithAnthropic(sanitizedAttendance, sanitizedTimetables, apiKey);
    } else if (process.env.GEMINI_API_KEY) {
      parsedResult = await extractWithGemini(sanitizedAttendance, sanitizedTimetables, process.env.GEMINI_API_KEY);
    } else {
      parsedResult = await extractWithTesseract(sanitizedAttendance, sanitizedTimetables);
    }
  } catch (err) {
    console.warn(`[EXTRACTOR] ${provider} vision call failed, falling back to local OCR engine:`, err.message);
    parsedResult = await extractWithTesseract(sanitizedAttendance, sanitizedTimetables);
  }

  // 3. Post-process & Format preset according to user specification
  // - If teachers exist: create entry for each teacher
  // - If no teachers exist: create entry with teacher: "" (blank!)
  const theoryEntries = [];
  for (const t of parsedResult.theory || []) {
    const code = sanitizeString(t.code);
    const teachers = (t.teachers && t.teachers.length > 0) ? t.teachers : [""];
    for (const teacher of teachers) {
      theoryEntries.push({
        code,
        name: sanitizeString(t.name),
        teacher: sanitizeString(teacher)
      });
    }
  }

  const labEntries = [];
  for (const l of parsedResult.lab || []) {
    const code = sanitizeString(l.code);
    const teachers = (l.teachers && l.teachers.length > 0) ? l.teachers : [""];
    for (const teacher of teachers) {
      labEntries.push({
        code,
        name: sanitizeString(l.name),
        teacher: sanitizeString(teacher)
      });
    }
  }

  // Combine Theory and Lab into Learning Entries
  const learningEntries = [];
  for (const t of theoryEntries) {
    learningEntries.push({
      code: t.code,
      name: t.name,
      teacher: t.teacher
    });
  }
  for (const l of labEntries) {
    learningEntries.push({
      code: l.code,
      name: l.name,
      teacher: l.teacher
    });
  }

  // Synthesize preset fields (strictly exclude rows where teacher is empty!)
  const validTheories = theoryEntries.filter(t => t.teacher.trim().length > 0);
  const validLabs = labEntries.filter(l => l.teacher.trim().length > 0);
  const validLearning = learningEntries.filter(le => le.teacher.trim().length > 0);

  const theoryCodes = validTheories.map(e => e.code).join(",");
  const theoryTeachers = validTheories.map(e => e.teacher).join(",");

  const labCodes = validLabs.map(e => e.code).join(",");
  const labTeachers = validLabs.map(e => e.teacher).join(",");

  const teachingCodes = validLearning.map(e => e.code).join(",");
  const teachingTeachers = validLearning.map(e => e.teacher).join(",");

  return {
    status: "success",
    rawItems: {
      theory: theoryEntries,
      lab: labEntries,
      learning: learningEntries
    },
    suggestedPreset: {
      theoryCodes,
      theoryTeachers,
      labCodes,
      labTeachers,
      mentorDept: "Computer Science",
      mentorName: "",
      teachingCodes,
      teachingTeachers,
      feedbackOption: "Always"
    },
    groupsDetected: parsedResult.groupsDetected || ["Group 1", "Group 2"]
  };
}
