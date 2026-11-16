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
  const [attendanceFile, setAttendanceFile] = useState<{ name: string; base64: string } | null>(null);
  const [timetableFiles, setTimetableFiles] = useState<Array<{ name: string; base64: string }>>([]);
  const [geminiApiKey, setGeminiApiKey] = useState("");

  // Process States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisDone, setAnalysisDone] = useState(false);

  // Extracted Matrix Data
  const [theoryItems, setTheoryItems] = useState<MatrixItem[]>([]);
  const [labItems, setLabItems] = useState<MatrixItem[]>([]);
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
      return `Invalid file type "${file.name}". Only JPEG, PNG, and WebP images are permitted.`;
    }
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      return `File "${file.name}" exceeds the maximum safety limit of 15MB.`;
    }
    return null;
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Handle Attendance Upload
  const handleAttendanceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    try {
      const base64 = await toBase64(file);
      setAttendanceFile({ name: file.name, base64 });
    } catch (err) {
      setErrorMessage("Failed to read image file.");
    }
  };

  // Handle Timetable Upload (multi-file support)
  const handleTimetableChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    if (timetableFiles.length + files.length > 6) {
      setErrorMessage("You can upload a maximum of 6 timetable screenshots.");
      return;
    }

    const newFiles: Array<{ name: string; base64: string }> = [];
    for (const f of files) {
      const validationError = validateFile(f);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
      try {
        const base64 = await toBase64(f);
        newFiles.push({ name: f.name, base64 });
      } catch (err) {
        setErrorMessage("Failed to read one or more timetable images.");
        return;
      }
    }
    setTimetableFiles(prev => [...prev, ...newFiles]);
  };

  const removeTimetableFile = (index: number) => {
    setTimetableFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Trigger Analysis
  const handleAnalyze = async () => {
    setErrorMessage(null);
    if (!attendanceFile) {
      setErrorMessage("Please upload your Subject-wise Attendance page screenshot.");
      return;
    }
    if (timetableFiles.length === 0) {
      setErrorMessage("Please upload at least one Time Table screenshot (showing all days).");
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
          geminiApiKey: geminiApiKey.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Failed to analyze screenshots.");
      }

      // Populate Extracted Items
      const tItems: MatrixItem[] = (data.rawItems?.theory || []).map((t: any, idx: number) => ({
        id: `t-${idx}-${Date.now()}`,
        code: t.code,
        name: t.name,
        teacher: t.teacher
      }));

      const lItems: MatrixItem[] = (data.rawItems?.lab || []).map((l: any, idx: number) => ({
        id: `l-${idx}-${Date.now()}`,
        code: l.code,
        name: l.name,
        teacher: l.teacher
      }));

      setTheoryItems(tItems);
      setLabItems(lItems);
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
      // Keep Group 1 choices (e.g. Mariyam Fatima CS418, Mohd Anas Khan CS417)
      setTheoryItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("bushra fatima")));
    } else {
      // Keep Group 2 choices (e.g. Bushra Fatima CS419, Dr. Faiyaz Ahamad CS415)
      setTheoryItems(prev => prev.filter(item => !item.teacher.toLowerCase().includes("mariyam fatima")));
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

  // Finalize & Load Preset (Stored in User's Current Session Storage Only)
  const handleFinalize = () => {
    setErrorMessage(null);

    // Validate entries
    const validTheories = theoryItems.filter(t => t.code.trim() && t.teacher.trim());
    const validLabs = labItems.filter(l => l.code.trim() && l.teacher.trim());

    if (validTheories.length === 0) {
      setErrorMessage("Theory Matrix cannot be empty. Please include at least one valid Theory code and instructor.");
      return;
    }
    if (validLabs.length === 0) {
      setErrorMessage("Lab Modules cannot be empty. Please include at least one valid Lab code and engineer.");
      return;
    }
    if (!mentorDept.trim()) {
      setErrorMessage("Please enter the Mentor Department.");
      return;
    }
    if (!mentorName.trim()) {
      setErrorMessage("Please enter the Mentor Name.");
      return;
    }

    const theoryCodes = validTheories.map(t => t.code.trim().toUpperCase()).join(",");
    const theoryTeachers = validTheories.map(t => t.teacher.trim()).join(",");

    const labCodes = validLabs.map(l => l.code.trim().toUpperCase()).join(",");
    const labTeachers = validLabs.map(l => l.teacher.trim()).join(",");

    const teachingCodes = [theoryCodes, labCodes].filter(Boolean).join(",");
    const teachingTeachers = [theoryTeachers, labTeachers].filter(Boolean).join(",");

    const presetPayload = {
      name: "Scanned: Image Analysis",
      theoryCodes,
      theoryTeachers,
      labCodes,
      labTeachers,
      mentorDept: mentorDept.trim(),
      mentorName: mentorName.trim(),
      teachingCodes,
      teachingTeachers,
      feedbackOption: "Always",
      scannedAt: new Date().toISOString()
    };

    try {
      // Store STRICTLY in the current user's session storage only as requested
      sessionStorage.setItem("feedback_bot_scanned_preset", JSON.stringify(presetPayload));
      router.push("/op?preset=scanned");
    } catch (e: any) {
      setErrorMessage("Could not save preset to session storage: " + e.message);
    }
  };

  return (
    <div className={styles.scanContainer}>
      {/* Header */}
      <header className={styles.header}>
        <Link href="/op" className={styles.backLink}>
          <span>← Back to Operation Config</span>
        </Link>
        <h1 className={styles.title}>TIME TABLE &amp; ATTENDANCE SCANNER</h1>
        <p className={styles.subtitle}>
          Upload college portal screenshots to extract subject codes, separate theory and lab teachers, and load a ready-to-run preset into your current session.
        </p>
      </header>

      {/* Guidelines Box */}
      <div className={styles.guidelinesBox}>
        <div className={styles.guidelinesHeader}>
          <span>📸 Screenshot Quality Directives</span>
        </div>
        <ul className={styles.guidelinesList}>
          <li>
            <strong>Attendance Page Screenshot:</strong> Must clearly capture the <em>Subject column</em>, <em>Subject Codes</em> (e.g., <code>CG401</code>, <code>CS410</code>), and <em>Type</em> indicators (<code>( T )</code> / Theory, <code>( P )</code> / Practical).
          </li>
          <li>
            <strong>Time Table Screenshot(s):</strong> Must display <strong>all days</strong> (Monday through Saturday/Sunday) and all 8 periods. You can upload multiple screenshots if the timetable spans across views.
          </li>
          <li>
            <strong>Supported Formats:</strong> JPEG, PNG, or WebP. All uploads are re-encoded and sanitized via Sharp to prevent security vulnerabilities.
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
            <span className={styles.badge}>Single Image</span>
          </div>
          <div
            className={`${styles.dropzone} ${attendanceFile ? styles.dropzoneActive : ""}`}
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
            <span className={styles.dropText}>
              {attendanceFile ? attendanceFile.name : "Click or drop Attendance screenshot"}
            </span>
            <span className={styles.dropSubtext}>Shows Subject Codes &amp; (T)/(P) types</span>
          </div>
          {attendanceFile && (
            <div className={styles.gallery}>
              <div className={styles.thumbWrapper}>
                <img src={attendanceFile.base64} alt="Attendance" className={styles.thumbImg} />
                <button
                  type="button"
                  className={styles.removeThumb}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAttendanceFile(null);
                  }}
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Timetable Card */}
        <div className={styles.uploadCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              📅 Time Table Screenshot(s)
            </span>
            <span className={styles.badge}>{timetableFiles.length} of 6 Uploaded</span>
          </div>
          <div
            className={`${styles.dropzone} ${timetableFiles.length > 0 ? styles.dropzoneActive : ""}`}
            onClick={() => ttInputRef.current?.click()}
          >
            <input
              type="file"
              ref={ttInputRef}
              multiple
              accept="image/png,image/jpeg,image/webp"
              className={styles.fileInput}
              onChange={handleTimetableChange}
            />
            <span className={styles.dropIcon}>🗓️</span>
            <span className={styles.dropText}>
              Click or drop Time Table screenshot(s)
            </span>
            <span className={styles.dropSubtext}>Ensure all days (Mon-Sat) are covered</span>
          </div>
          {timetableFiles.length > 0 && (
            <div className={styles.gallery}>
              {timetableFiles.map((file, idx) => (
                <div key={idx} className={styles.thumbWrapper}>
                  <img src={file.base64} alt={`Timetable ${idx + 1}`} className={styles.thumbImg} />
                  <button
                    type="button"
                    className={styles.removeThumb}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTimetableFile(idx);
                    }}
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optional Gemini Vision API key option */}
      <div className={styles.apiKeyCard}>
        <div>
          <div className={styles.apiKeyLabel}>⚡ Vision Engine Preference</div>
          <span style={{ fontSize: "0.75rem", color: "#666" }}>
            Leave blank to use built-in offline OCR, or provide a Gemini API key for multimodal reasoning.
          </span>
        </div>
        <input
          type="password"
          className={styles.apiKeyInput}
          placeholder="Optional: Gemini API Key (AIza...)"
          value={geminiApiKey}
          onChange={(e) => setGeminiApiKey(e.target.value)}
        />
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
                    <th style={{ width: "40%" }}>Subject Name</th>
                    <th style={{ width: "35%" }}>Instructor Name</th>
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
                          className={styles.tableInput}
                          value={item.teacher}
                          placeholder="Teacher Name"
                          onChange={(e) => handleTheoryChange(item.id, "teacher", e.target.value)}
                        />
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
                    <th style={{ width: "40%" }}>Subject Name</th>
                    <th style={{ width: "35%" }}>Lab Engineer Name</th>
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
                          className={styles.tableInput}
                          value={item.teacher}
                          placeholder="Engineer Name"
                          onChange={(e) => handleLabChange(item.id, "teacher", e.target.value)}
                        />
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

          {/* Section 06 - Mentor Directive */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 06 - Mentor Directive</span>
            </div>
            <div className={styles.mentorGrid}>
              <div className={styles.mentorGroup}>
                <label className={styles.mentorLabel}>Department</label>
                <input
                  type="text"
                  className={styles.tableInput}
                  placeholder="e.g. Computer Science"
                  value={mentorDept}
                  onChange={(e) => setMentorDept(e.target.value)}
                />
              </div>
              <div className={styles.mentorGroup}>
                <label className={styles.mentorLabel}>Mentor Name (Required)</label>
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

          {/* Section 07 - Learning Protocols Combined Preview */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>
              <span>Section 07 - Learning Protocols (Combined Theory + Labs)</span>
            </div>
            <div className={styles.protocolsPreview}>
              <div><strong>CODES:</strong> {theoryItems.map(t => t.code).concat(labItems.map(l => l.code)).filter(Boolean).join(",") || "None"}</div>
              <div style={{ marginTop: "0.4rem" }}><strong>INSTRUCTORS:</strong> {theoryItems.map(t => t.teacher).concat(labItems.map(l => l.teacher)).filter(Boolean).join(",") || "None"}</div>
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

