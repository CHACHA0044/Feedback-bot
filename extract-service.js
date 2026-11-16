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

/**
 * Extract structured presets using Gemini Vision if an API key is provided
 */
async function extractWithGemini(attendanceBuf, timetableBufs, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const contents = [
    {
      parts: [
        {
          text: `You are an expert college academic schedule parser.
I have uploaded screenshots of a college student's Attendance page and Time Table page(s).

Extract:
1. From Attendance: All course subjects, their codes, and whether they are Theory (marked T or Theory) or Lab (marked P or Practical). Omit Library attendance.
2. From Time Table: Find teachers teaching each subject code.
   - If a theory code has 2 teachers (e.g. CG401 has Ayaz Mahmood and Dr. Sufia Rehman), list both teachers.
   - If a lab subject has multiple teachers (e.g. CS424 has Ambreen Anees and Riajuddin Khan), list all teachers.
   - If there are elective/group options (Group 1 vs Group 2), detect them.

Output ONLY valid JSON matching this schema:
{
  "theory": [
    { "code": "CG401", "name": "Career Development Course", "teachers": ["Ayaz Mahmood", "Dr. Sufia Rehman"] },
    { "code": "CS410", "name": "Distributed Systems", "teachers": ["Saman Khan"] },
    { "code": "CS412", "name": "Cryptography and Network Security", "teachers": ["Imtiyazul Haq"] },
    { "code": "CS415", "name": "Fuzzy Logic & Neural Networks", "teachers": ["Dr. Faiyaz Ahamad"] },
    { "code": "CS418", "name": "Data Warehousing & Data Mining", "teachers": ["Mariyam Fatima"] },
    { "code": "CS486", "name": "Cloud Security", "teachers": ["Abhishek Pandey"] }
  ],
  "lab": [
    { "code": "CS421", "name": "Minor Project", "teachers": ["Mohd Anas Khan"] },
    { "code": "CS424", "name": "SciLab", "teachers": ["Ambreen Anees", "Riajuddin Khan"] }
  ],
  "groupsDetected": ["Group 1", "Group 2"]
}`
        },
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
 * Built-in OCR Extraction using Sharp + Tesseract
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

  // Standard Subject Registry for IUSMS Curriculum
  const subjectRegistry = [
    { code: "CG401", name: "Career Development Course", type: "theory", keywords: ["career", "cg401", "cg40"] },
    { code: "CS410", name: "Distributed Systems", type: "theory", keywords: ["distributed", "cs410", "c5410"] },
    { code: "CS412", name: "Cryptography and Network Security", type: "theory", keywords: ["cryptography", "network security", "cs412", "c5412"] },
    { code: "CS415", name: "Fuzzy Logic & Neural Networks", type: "theory", keywords: ["fuzzy", "neural", "cs415", "c5415"] },
    { code: "CS417", name: "Mobile Computing", type: "theory", keywords: ["mobile", "cs417", "c5417"] },
    { code: "CS418", name: "Data Warehousing & Data Mining", type: "theory", keywords: ["warehousing", "data mining", "cs418", "c5418"] },
    { code: "CS419", name: "Pattern Recognition", type: "theory", keywords: ["pattern", "cs419", "c5419"] },
    { code: "CS486", name: "Cloud Security", type: "theory", keywords: ["cloud", "cs486", "c5486"] },
    { code: "CS300", name: "Industrial Training/Internship", type: "lab", keywords: ["industrial", "internship", "apprenticeship", "cs300"] },
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

  // Faculty mapping in Timetable
  const facultyDatabase = [
    { name: "Ayaz Mahmood", codes: ["CG401"] },
    { name: "Dr. Sufia Rehman", codes: ["CG401", "CG302"] },
    { name: "Saman Khan", codes: ["CS410", "CS315"] },
    { name: "Imtiyazul Haq", codes: ["CS412", "CS421"] },
    { name: "Dr. Faiyaz Ahamad", codes: ["CS415", "CS421"] },
    { name: "Mariyam Fatima", codes: ["CS418"] },
    { name: "Abhishek Pandey", codes: ["CS486"] },
    { name: "Mohd Anas Khan", codes: ["CS417", "CS421"] },
    { name: "Ambreen Anees", codes: ["CS424"] },
    { name: "Riajuddin Khan", codes: ["CS424"] },
    { name: "Bushra Fatima", codes: ["CS419"] },
    { name: "Dr. Mohammad Suaib", codes: ["CS421"] },
    { name: "Shoeb Ahad Siddiqui", codes: ["CS421"] },
    { name: "Pushpendra Dwivedi", codes: ["CS421"] },
    { name: "Falak Alam", codes: ["CS421", "CS306"] },
    { name: "Aaftab Alam", codes: ["CS421"] },
    { name: "Dr. Jameel Ahmad", codes: ["CS421"] },
    { name: "Tabassum", codes: ["CS421"] },
    { name: "Ajaz Husain Warsi", codes: ["CS421"] },
    { name: "Rahul Ranjan", codes: ["CS305"] },
    { name: "Mohammad Aman", codes: ["CS306"] },
    { name: "Naziya Anjum", codes: ["CS313", "CS314"] },
    { name: "Mariyam Kidwai", codes: ["CS315"] },
    { name: "Azra Iftekhar", codes: ["CS348"] },
    { name: "Mr. Sunil Singh", codes: ["CS394", "CS396"] },
    { name: "Akhlaque Ahmad Khan", codes: ["EC339"] }
  ];

  // Step 1: Detect subjects from Attendance OCR
  const attLower = attRaw.toLowerCase();
  const matchedSubjects = [];

  for (const item of subjectRegistry) {
    const isPresent = item.keywords.some(kw => attLower.includes(kw));
    if (isPresent) {
      matchedSubjects.push(item);
    }
  }

  // If attendance missed some, check if timetable text mentions subjects
  const ttLower = ttCombinedRaw.toLowerCase();
  for (const item of subjectRegistry) {
    if (!matchedSubjects.some(m => m.code === item.code)) {
      if (ttLower.includes(item.code.toLowerCase())) {
        matchedSubjects.push(item);
      }
    }
  }

  // Step 2: Extract teachers for matched subjects
  const theoryResult = [];
  const labResult = [];

  for (const sub of matchedSubjects) {
    // Find faculty associated with this code that appear in timetable text
    const assignedFaculty = facultyDatabase.filter(f => {
      if (!f.codes.includes(sub.code)) return false;
      const nameParts = f.name.toLowerCase().split(" ");
      const lastName = nameParts[nameParts.length - 1];
      const firstName = nameParts[0];
      return ttLower.includes(f.name.toLowerCase()) || (lastName.length > 3 && ttLower.includes(lastName));
    }).map(f => f.name);

    // Fallback if timetable text was blurry
    const teachers = assignedFaculty.length > 0 
      ? assignedFaculty 
      : facultyDatabase.filter(f => f.codes.includes(sub.code)).map(f => f.name);

    if (sub.type === "theory") {
      theoryResult.push({
        code: sub.code,
        name: sub.name,
        teachers: teachers.length > 0 ? teachers : ["Instructor"]
      });
    } else {
      // Lab
      labResult.push({
        code: sub.code,
        name: sub.name,
        teachers: teachers.length > 0 ? teachers : ["Lab Engineer"]
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
export async function processScreenshotExtraction({ attendanceImage, timetableImages, geminiApiKey }) {
  // 1. Security validate and sanitize images
  const sanitizedAttendance = await validateAndSanitizeImage(attendanceImage, "Attendance Page");

  if (!Array.isArray(timetableImages) || timetableImages.length === 0) {
    throw new Error("Time Table: At least one time table screenshot is required.");
  }
  if (timetableImages.length > 6) {
    throw new Error("Time Table: A maximum of 6 screenshots are permitted.");
  }

  const sanitizedTimetables = [];
  for (let i = 0; i < timetableImages.length; i++) {
    sanitizedTimetables.push(await validateAndSanitizeImage(timetableImages[i], `Time Table Segment ${i + 1}`));
  }

  // 2. Perform Extraction
  let parsedResult;
  if (geminiApiKey) {
    try {
      parsedResult = await extractWithGemini(sanitizedAttendance, sanitizedTimetables, geminiApiKey);
    } catch (err) {
      console.warn("[EXTRACTOR] Gemini Vision failed, falling back to Tesseract:", err.message);
      parsedResult = await extractWithTesseract(sanitizedAttendance, sanitizedTimetables);
    }
  } else {
    parsedResult = await extractWithTesseract(sanitizedAttendance, sanitizedTimetables);
  }

  // 3. Post-process & Format preset according to user specification
  // - Theory: Comma-separated theoryCodes & theoryTeachers (repeat code if multiple teachers)
  // - Lab: If single code has multiple teachers, create separate entries (CS424,CS424 -> Ambreen Anees, Riajuddin Khan)
  // - Learning protocols: Combines theory + lab
  const theoryEntries = [];
  for (const t of parsedResult.theory || []) {
    const code = sanitizeString(t.code);
    const teachers = (t.teachers && t.teachers.length > 0) ? t.teachers : ["TBD"];
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
    // If it's CS300 (industrial training with no classes), user can keep or omit
    const code = sanitizeString(l.code);
    const teachers = (l.teachers && l.teachers.length > 0) ? l.teachers : ["TBD"];
    for (const teacher of teachers) {
      labEntries.push({
        code,
        name: sanitizeString(l.name),
        teacher: sanitizeString(teacher)
      });
    }
  }

  // Synthesize preset fields
  const theoryCodes = theoryEntries.map(e => e.code).join(",");
  const theoryTeachers = theoryEntries.map(e => e.teacher).join(",");

  const labCodes = labEntries.map(e => e.code).join(",");
  const labTeachers = labEntries.map(e => e.teacher).join(",");

  const teachingCodes = [theoryCodes, labCodes].filter(Boolean).join(",");
  const teachingTeachers = [theoryTeachers, labTeachers].filter(Boolean).join(",");

  return {
    status: "success",
    rawItems: {
      theory: theoryEntries,
      lab: labEntries
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
