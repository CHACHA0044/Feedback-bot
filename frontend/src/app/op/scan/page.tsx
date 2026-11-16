"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./Scan.module.css";

interface MatrixItem {
  id: string;
  code: string;
  name: string;
  teacher: string;
}

export default function ScanPage() {
  const router = useRouter();

  // Upload States
  const [attendanceFile, setAttendanceFile] = useState<{ name: string; size: string; base64: string } | null>(null);
  const [timetableFiles, setTimetableFiles] = useState<Array<{ name: string; size: string; base64: string }>>([]);
  
  // AI Provider & Key State
  const [aiProvider, setAiProvider] = useState<"gemini" | "openai" | "groq" | "anthropic" | "local">("gemini");
  const [apiKey, setApiKey] = useState("");

  // Process States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisDone, setAnalysisDone] = useState(false);

  // Lightbox / Image Preview Modal
  const [previewModal, setPreviewModal] = useState<{ open: boolean; src: string; caption: string }>({
    open: false,
    src: "",
    caption: ""
  });

  // Extracted Matrix Data (All three sections use the exact same MatrixItem structure)
  const [theoryItems, setTheoryItems] = useState<MatrixItem[]>([]);
  const [labItems, setLabItems] = useState<MatrixItem[]>([]);
  const [learningItems, setLearningItems] = useState<MatrixItem[]>([]);
  const [mentorDept, setMentorDept] = useState("Computer Science");
  const [mentorName, setMentorName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // File Input Refs
  const attInputRef = useRef<HTMLInputElement>(null);
  const ttInputRef = useRef<HTMLInputElement>(null);

  // File Validation Helper (Strict client-side anti-malware verification)
  const validateFile = (file: File): string | null => {
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      return `Invalid file type "${file.name}". Only genuine JPEG, PNG, and WebP images are permitted.`;
    }
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      return `File "${file.name}" exceeds the maximum safety limit of 15MB.`;
    }
    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Handle Attendance Upload (Disallows more than 1 image until deleted)
  const handleAttendanceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (!e.target.files || e.target.files.length === 0) return;
    if (attendanceFile) return; // Prevent uploading if already uploaded

    const file = e.target.files[0];
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    try {
      const base64 = await toBase64(file);
      setAttendanceFile({ name: file.name, size: formatFileSize(file.size), base64 });
    } catch (_) {
      setErrorMessage("Failed to read image file.");
    }
    // Reset file input value so re-uploading same filename works if deleted
    if (attInputRef.current) attInputRef.current.value = "";
  };

  // Handle Timetable Upload (Strictly limits to no more than 3 images)
  const handleTimetableChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (!e.target.files) return;
    const remainingSlots = 3 - timetableFiles.length;
    if (remainingSlots <= 0) {
      setErrorMessage("Maximum 3 timetable screenshots allowed. Please delete one to add another.");
      return;
    }

    const files = Array.from(e.target.files).slice(0, remainingSlots);
    const newFiles: Array<{ name: string; size: string; base64: string }> = [];

    for (const f of files) {
      const validationError = validateFile(f);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
      try {
        const base64 = await toBase64(f);
        newFiles.push({ name: f.name, size: formatFileSize(f.size), base64 });
      } catch (_) {
        setErrorMessage("Failed to read one or more timetable images.");
        return;
      }
    }
    setTimetableFiles(prev => [...prev, ...newFiles]);
    if (ttInputRef.current) ttInputRef.current.value = "";
  };

  const removeTimetableFile = (index: number) => {
    setTimetableFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Modal Lightbox Preview
  const openPreview = (src: string, caption: string) => {
    setPreviewModal({ open: true, src, caption });
  };
  const closePreview = () => {
    setPreviewModal({ open: false, src: "", caption: "" });
  };

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Trigger Analysis
  const handleAnalyze = async () => {
    setErrorMessage(null);
    if (!attendanceFile) {
      setErrorMessage("Please upload your Subject-wise Attendance page screenshot.");
      return;
    }
    if (timetableFiles.length === 0) {
      setErrorMessage("Please upload at least one Time Table screenshot (maximum 3, showing all days).");
      return;
    }

    setIsAnalyzing(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${backendUrl}/api/extract-preset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          attendanceImage: attendanceFile.base64,
          timetableImages: timetableFiles.map(f => f.base64),
          aiProvider,
          apiKey: apiKey.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Failed to analyze screenshots.");
      }

      // Populate Extracted Items
      const tItems: MatrixItem[] = (data.rawItems?.theory || []).map((t: any, idx: number) => ({
        id: `t-${idx}-${Date.now()}`,
        code: t.code || "",
        name: t.name || "",
        teacher: t.teacher || ""
      }));

      const lItems: MatrixItem[] = (data.rawItems?.lab || []).map((l: any, idx: number) => ({
        id: `l-${idx}-${Date.now()}`,
        code: l.code || "",
        name: l.name || "",
        teacher: l.teacher || ""
      }));

      // Learning Protocols combines Theory and Lab
      const learnItems: MatrixItem[] = [...tItems, ...lItems].map((item, idx) => ({
        id: `learn-${idx}-${Date.now()}`,
        code: item.code,
        name: item.name,
        teacher: item.teacher
      }));

      setTheoryItems(tItems);
      setLabItems(lItems);
      setLearningItems(learnItems);
      setMentorDept(data.suggestedPreset?.mentorDept || "Computer Science");
      setMentorName(data.suggestedPreset?.mentorName || "");
      setAnalysisDone(true);
    } catch (err: any) {
      console.error("[SCAN] Analysis error:", err);
      setErrorMessage(err.message || "Matrix extraction failed. Please check image clarity and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Group quick filter (e.g. Group 1 vs Group 2)
  const handleApplyGroupFilter = (group: "Group 1" | "Group 2") => {
    setSelectedGroup(group);
    if (group === "Group 1") {
      setTheoryItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("bushra fatima")));
      setLearningItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("bushra fatima")));
    } else {
      setTheoryItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("mariyam fatima")));
      setLearningItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("mariyam fatima")));
    }
  };

  // Theory Item Handlers
  const handleTheoryChange = (id: string, field: "code" | "name" | "teacher", value: string) => {
    setTheoryItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removeTheoryRow = (id: string) => {
    setTheoryItems(prev => prev.filter(item => item.id !== id));
  };
  const addTheoryRow = () => {
    setTheoryItems(prev => [...prev, { id: `t-custom-${Date.now()}`, code: "", name: "", teacher: "" }]);
  };

  // Lab Item Handlers
  const handleLabChange = (id: string, field: "code" | "name" | "teacher", value: string) => {
    setLabItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removeLabRow = (id: string) => {
    setLabItems(prev => prev.filter(item => item.id !== id));
  };
  const addLabRow = () => {
    setLabItems(prev => [...prev, { id: `l-custom-${Date.now()}`, code: "", name: "", teacher: "" }]);
  };

  // Learning Item Handlers
  const handleLearningChange = (id: string, field: "code" | "name" | "teacher", value: string) => {
    setLearningItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removeLearningRow = (id: string) => {
    setLearningItems(prev => prev.filter(item => item.id !== id));
  };
  const addLearningRow = () => {
    setLearningItems(prev => [...prev, { id: `learn-custom-${Date.now()}`, code: "", name: "", teacher: "" }]);
  };

  // Finalize & Load Preset (Stored in User's Current Session Storage Only)
  const handleFinalize = () => {
    setErrorMessage(null);

    // Filter out rows where teacher is empty! (User directive: "for subject whose teachers dosent exist leave that blank and tell user this wont be transfered to operation page unless u enter teacher name")
    const validTheories = theoryItems.filter(t => t.code.trim() && t.teacher.trim());
    const validLabs = labItems.filter(l => l.code.trim() && l.teacher.trim());
    const validLearnings = learningItems.filter(le => le.code.trim() && le.teacher.trim());

    if (validTheories.length === 0) {
      setErrorMessage("Theory Matrix has no valid instructor names. Please enter teacher names for at least one Theory subject.");
      return;
    }
    if (validLabs.length === 0) {
      setErrorMessage("Lab Modules has no valid engineer names. Please enter teacher names for at least one Lab subject.");
      return;
    }

    const theoryCodes = validTheories.map(t => t.code.trim().toUpperCase()).join(",");
    const theoryTeachers = validTheories.map(t => t.teacher.trim()).join(",");

    const labCodes = validLabs.map(l => l.code.trim().toUpperCase()).join(",");
    const labTeachers = validLabs.map(l => l.teacher.trim()).join(",");

    // If learning rows were manually edited, use validLearnings, else combine validTheories + validLabs
    const teachingCodes = validLearnings.length > 0 
      ? validLearnings.map(e => e.code.trim().toUpperCase()).join(",")
      : [theoryCodes, labCodes].filter(Boolean).join(",");
    const teachingTeachers = validLearnings.length > 0
      ? validLearnings.map(e => e.teacher.trim()).join(",")
      : [theoryTeachers, labTeachers].filter(Boolean).join(",");

    const presetPayload = {
      name: "Scanned: Image Analysis",
      theoryCodes,
      theoryTeachers,
      labCodes,
      labTeachers,
      mentorDept: mentorDept.trim() || "Computer Science",
      mentorName: mentorName.trim(), // Optional now!
      teachingCodes,
      teachingTeachers,
      feedbackOption: "Always",
      scannedAt: new Date().toISOString()
    };

    try {
      // Store STRICTLY in the current user's session storage only
      sessionStorage.setItem("feedback_bot_scanned_preset", JSON.stringify(presetPayload));
      router.push("/op?preset=scanned");
    } catch (e: any) {
      setErrorMessage("Could not save preset to session storage: " + e.message);
    }
  };

  return (
    <div className={styles.scanContainer}>
      {/* Lightbox / Image Preview Modal */}
      {previewModal.open && (
        <div className={styles.modalOverlay} onClick={closePreview}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalCloseBtn} onClick={closePreview} title="Close Preview">
              ✕
            </button>
            <img src={previewModal.src} alt="Screenshot Preview" className={styles.modalImage} />
            <div className={styles.modalCaption}>{previewModal.caption}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <Link href="/op" className={styles.backLink}>
          <span>← Back to Operation Config</span>
        </Link>
        <h1 className={styles.title}>TIME TABLE &amp; ATTENDANCE SCANNER</h1>
        <p className={styles.subtitle}>
          Upload college portal screenshots to extract subject codes, separate theory and lab teachers, and load a verified preset directly into your current session.
        </p>
      </header>

      {/* Guidelines Box */}
      <div className={styles.guidelinesBox}>
        <div className={styles.guidelinesHeader}>
          <span>📸 Screenshot Quality Directives</span>
        </div>
        <ul className={styles.guidelinesList}>
          <li>
            <strong>Attendance Page Screenshot:</strong> Single photo containing the <em>Subject column</em>, <em>Subject Codes</em> (e.g. <code>CG401</code>, <code>CS410</code>), and <em>Type</em> indicators (<code>( T )</code> / Theory, <code>( P )</code> / Practical).
          </li>
          <li>
            <strong>Time Table Screenshot(s):</strong> Maximum <strong>3 screenshots</strong> covering all days (Monday through Saturday) and all periods.
          </li>
          <li>
            <strong>Supported Formats:</strong> JPEG, PNG, or WebP. Re-encoded and sanitized via Sharp to prevent security vulnerabilities.
          </li>
        </ul>
      </div>

      {errorMessage && (
        <div className={styles.errorMessage}>
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Upload Dropzones */}
      <div className={styles.uploadGrid}>
        {/* Attendance Card */}
        <div className={styles.uploadCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              📄 Attendance Screenshot
            </span>
            <span className={styles.badge}>{attendanceFile ? "1 of 1 Uploaded" : "Single Image Required"}</span>
          </div>

          {attendanceFile ? (
            /* Uploaded State: Disallows another image until deleted + provides preview */
            <div className={styles.uploadedStateBox}>
              <img
                src={attendanceFile.base64}
                alt="Attendance Preview"
                className={styles.uploadedImageThumb}
                onClick={() => openPreview(attendanceFile.base64, attendanceFile.name)}
                title="Click to zoom preview"
              />
              <div className={styles.uploadedMeta}>
                <span className={styles.uploadedFileName}>{attendanceFile.name}</span>
                <span className={styles.uploadedNotice}>{attendanceFile.size} • 1 of 1 loaded</span>
                <div className={styles.actionButtonRow}>
                  <button
                    type="button"
                    className={styles.previewBtn}
                    onClick={() => openPreview(attendanceFile.base64, attendanceFile.name)}
                  >
                    🔍 Preview
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => setAttendanceFile(null)}
                    title="Delete and upload different screenshot"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Dropzone: Only shown when no image is uploaded */
            <div
              className={styles.dropzone}
              onClick={() => attInputRef.current?.click()}
            >
              <input
                type="file"
                ref={attInputRef}
                accept="image/png,image/jpeg,image/webp"
                className={styles.fileInput}
                onChange={handleAttendanceChange}
              />
              <span className={styles.dropIcon}>📋</span>
              <span className={styles.dropText}>Click or drop Attendance screenshot</span>
              <span className={styles.dropSubtext}>Shows Subject Codes &amp; (T)/(P) types (1 image only)</span>
            </div>
          )}
        </div>

        {/* Timetable Card */}
        <div className={styles.uploadCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              📅 Time Table Screenshot(s)
            </span>
            <span className={styles.badge}>{timetableFiles.length} of 3 Uploaded</span>
          </div>

          <div
            className={`${styles.dropzone} ${timetableFiles.length >= 3 ? styles.dropzoneDisabled : ""}`}
            onClick={() => {
              if (timetableFiles.length < 3) ttInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={ttInputRef}
              multiple
              disabled={timetableFiles.length >= 3}
              accept="image/png,image/jpeg,image/webp"
              className={styles.fileInput}
              onChange={handleTimetableChange}
            />
            <span className={styles.dropIcon}>🗓️</span>
            <span className={styles.dropText}>
              {timetableFiles.length >= 3 
                ? "Maximum 3 screenshots reached" 
                : "Click or drop Time Table screenshot(s)"}
            </span>
            <span className={styles.dropSubtext}>
              {timetableFiles.length >= 3 
                ? "Delete an image below to upload another" 
                : "Ensure all days (Mon-Sat) are covered (up to 3 images)"}
            </span>
          </div>

          {timetableFiles.length > 0 && (
            <div className={styles.gallery}>
              {timetableFiles.map((file, idx) => (
                <div
                  key={idx}
                  className={styles.thumbWrapper}
                  onClick={() => openPreview(file.base64, `Timetable Segment ${idx + 1}: ${file.name}`)}
                  title="Click to preview full image"
                >
                  <img src={file.base64} alt={`Timetable ${idx + 1}`} className={styles.thumbImg} />
                  <span className={styles.clickPreviewBadge}>🔍 Zoom</span>
                  <button
                    type="button"
                    className={styles.removeThumb}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTimetableFile(idx);
                    }}
                    title="Delete image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Vision Engine Selection & Multiple API Keys */}
      <div className={styles.apiKeyCard}>
        <div className={styles.apiKeyHeader}>
          <div className={styles.apiKeyLabel}>
            <span>⚡ AI Vision Engine &amp; API Key</span>
          </div>
          <span className={styles.apiKeySubtext}>
            Choose your preferred AI vision model or use the built-in offline OCR engine.
          </span>
        </div>

        <div className={styles.providerRow}>
          <select
            className={styles.providerSelect}
            value={aiProvider}
            onChange={(e) => setAiProvider(e.target.value as any)}
          >
            <option value="gemini">Google Gemini (Flash)</option>
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="groq">Groq (Llama-3.2 Vision)</option>
            <option value="anthropic">Anthropic (Claude 3.5)</option>
            <option value="local">Offline Local OCR (No Key Needed)</option>
          </select>

          <input
            type="password"
            className={styles.apiKeyInput}
            disabled={aiProvider === "local"}
            placeholder={
              aiProvider === "gemini" ? "Optional: Gemini API Key (AIza...)" :
              aiProvider === "openai" ? "Optional: OpenAI API Key (sk-...)" :
              aiProvider === "groq" ? "Optional: Groq API Key (gsk_...)" :
              aiProvider === "anthropic" ? "Optional: Anthropic API Key (sk-ant-...)" :
              "Built-in offline Sharp + Tesseract engine active"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </div>

      {/* Scan Button */}
      <div className={styles.actionCenter}>
        <button
          type="button"
          className={styles.scanActionBtn}
          onClick={handleAnalyze}
          disabled={isAnalyzing || !attendanceFile || timetableFiles.length === 0}
        >
          {isAnalyzing ? (
            <>
              <div className={styles.spinner} />
              <span>Analyzing Matrix &amp; Cross-Referencing...</span>
            </>
          ) : (
            <>
              <span>⚡ Analyze &amp; Extract Matrix</span>
            </>
          )}
        </button>
      </div>

      {/* Interactive Review Section */}
      {analysisDone && (
        <section className={styles.matrixReviewSection}>
          <div className={styles.reviewTitle}>
            <span>VERIFICATION MATRIX</span>
            <span className={styles.reviewSubtitle}>Review, adjust instructors, and finalize preset</span>
          </div>

          {/* Group / Elective Conflict Chooser */}
          <div className={styles.conflictCard}>
            <div className={styles.conflictHeader}>
              👥 Batch / Group Filter &amp; Conflict Resolver
            </div>
            <p style={{ fontSize: "0.8rem", color: "#bbb", marginBottom: "0.75rem" }}>
              If your class divides into groups (e.g. Group 1 vs Group 2), choose your group to automatically prune opposing teachers, or edit names below.
            </p>
            <div className={styles.conflictButtonGroup}>
              <button
                type="button"
                className={`${styles.groupChoiceBtn} ${selectedGroup === "Group 1" ? styles.groupChoiceBtnActive : ""}`}
                onClick={() => handleApplyGroupFilter("Group 1")}
              >
                Filter: Group 1
              </button>
              <button
                type="button"
                className={`${styles.groupChoiceBtn} ${selectedGroup === "Group 2" ? styles.groupChoiceBtnActive : ""}`}
                onClick={() => handleApplyGroupFilter("Group 2")}
              >
                Filter: Group 2
              </button>
              {selectedGroup && (
                <button
                  type="button"
                  className={styles.groupChoiceBtn}
                  onClick={() => setSelectedGroup(null)}
                  style={{ borderColor: "#666" }}
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* Section 04 - Theory Matrix */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 04 - Theory Matrix (T / Theory in Attendance)</span>
              <button type="button" className={styles.addRowBtn} onClick={addTheoryRow}>
                + Add Theory Row
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Subject Code</th>
                    <th style={{ width: "35%" }}>Subject Name</th>
                    <th style={{ width: "40%" }}>Instructor Name</th>
                    <th style={{ width: "5%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {theoryItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.code}
                          placeholder="e.g. CS410"
                          onChange={(e) => handleTheoryChange(item.id, "code", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.name}
                          placeholder="Subject Title"
                          onChange={(e) => handleTheoryChange(item.id, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={`${styles.tableInput} ${!item.teacher.trim() ? styles.missingTeacherInput : ""}`}
                          value={item.teacher}
                          placeholder="Enter teacher name..."
                          onChange={(e) => handleTheoryChange(item.id, "teacher", e.target.value)}
                        />
                        {!item.teacher.trim() && (
                          <div className={styles.missingTeacherNotice}>
                            ⚠️ Missing Teacher — Won't be transferred to operation page unless entered.
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.rowActionBtn}
                          onClick={() => removeTheoryRow(item.id)}
                          title="Delete row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 05 - Lab Modules */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 05 - Lab Modules (P / Practical in Attendance)</span>
              <button type="button" className={styles.addRowBtn} onClick={addLabRow}>
                + Add Lab Row
              </button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.75rem" }}>
              💡 Dual Instructors: For lab subjects with 2 teachers (e.g. CS424), separate entries have been created for each teacher.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Lab Code</th>
                    <th style={{ width: "35%" }}>Subject Name</th>
                    <th style={{ width: "40%" }}>Lab Engineer Name</th>
                    <th style={{ width: "5%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {labItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.code}
                          placeholder="e.g. CS424"
                          onChange={(e) => handleLabChange(item.id, "code", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.name}
                          placeholder="Lab Title"
                          onChange={(e) => handleLabChange(item.id, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={`${styles.tableInput} ${!item.teacher.trim() ? styles.missingTeacherInput : ""}`}
                          value={item.teacher}
                          placeholder="Enter engineer name..."
                          onChange={(e) => handleLabChange(item.id, "teacher", e.target.value)}
                        />
                        {!item.teacher.trim() && (
                          <div className={styles.missingTeacherNotice}>
                            ⚠️ Missing Teacher — Won't be transferred to operation page unless entered.
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.rowActionBtn}
                          onClick={() => removeLabRow(item.id)}
                          title="Delete row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 06 - Mentor Directive (Removed required text) */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 06 - Mentor Directive</span>
            </div>
            <div className={styles.mentorGrid}>
              <div className={styles.mentorGroup}>
                <label className={styles.mentorLabel}>DEPARTMENT</label>
                <input
                  type="text"
                  className={styles.tableInput}
                  placeholder="e.g. Computer Science"
                  value={mentorDept}
                  onChange={(e) => setMentorDept(e.target.value)}
                />
              </div>
              <div className={styles.mentorGroup}>
                <label className={styles.mentorLabel}>MENTOR NAME</label>
                <input
                  type="text"
                  className={styles.tableInput}
                  placeholder="e.g. Tabassum or Saman Khan"
                  value={mentorName}
                  onChange={(e) => setMentorName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 07 - Learning Protocols (Exact same editable table as Section 04 and 05) */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 07 - Learning Protocols (Combined Theory + Labs)</span>
              <button type="button" className={styles.addRowBtn} onClick={addLearningRow}>
                + Add Learning Row
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Subject Code</th>
                    <th style={{ width: "35%" }}>Subject Name</th>
                    <th style={{ width: "40%" }}>Instructor Name</th>
                    <th style={{ width: "5%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {learningItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.code}
                          placeholder="e.g. CS410"
                          onChange={(e) => handleLearningChange(item.id, "code", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.tableInput}
                          value={item.name}
                          placeholder="Subject Title"
                          onChange={(e) => handleLearningChange(item.id, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={`${styles.tableInput} ${!item.teacher.trim() ? styles.missingTeacherInput : ""}`}
                          value={item.teacher}
                          placeholder="Instructor Name"
                          onChange={(e) => handleLearningChange(item.id, "teacher", e.target.value)}
                        />
                        {!item.teacher.trim() && (
                          <div className={styles.missingTeacherNotice}>
                            ⚠️ Missing Teacher — Won't be transferred to operation page unless entered.
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.rowActionBtn}
                          onClick={() => removeLearningRow(item.id)}
                          title="Delete row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Bar */}
          <div className={styles.finalizeBar}>
            <Link href="/op" className={styles.cancelBtn}>
              Cancel
            </Link>
            <button
              type="button"
              className={styles.finalizeBtn}
              onClick={handleFinalize}
            >
              💾 Finalize &amp; Load Preset to Session
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
