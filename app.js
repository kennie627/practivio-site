// app.js
// Engineering Mentor — Frontend logic
// - Reliable PDF extraction (resume + LinkedIn) via PDF.js worker
// - Start buttons scroll to sections
// - Calls Netlify Functions that now use OpenAI (gpt-4.1-nano)

const GOOGLE_BOOKING_LINK = ""; // e.g. "https://calendar.google.com/calendar/u/0/appointments/schedules/XXXX"

// ---- Netlify function endpoints ----
const RESUME_REVIEW_ENDPOINT = "/.netlify/functions/reviewResume";
const LINKEDIN_REVIEW_ENDPOINT = "/.netlify/functions/reviewLinkedIn";

document.addEventListener("DOMContentLoaded", () => {
  // Top start buttons
  const startResumeBtn = document.getElementById("startResume");
  const startLinkedInBtn = document.getElementById("startLinkedIn");

  // Sections
  const resumeSection = document.getElementById("resumeSection");
  const linkedinSection = document.getElementById("linkedinSection");

  // Resume elements
  const resumePdf = document.getElementById("resumePdf");
  const extractResumePdfBtn = document.getElementById("extractPdf");
  const resumePdfStatus = document.getElementById("pdfStatus");
  const resumeText = document.getElementById("resumeText");
  const resumeTargetRole = document.getElementById("resumeTargetRole");
  const runResumeReviewBtn = document.getElementById("runResumeReview");
  const resumeOutput = document.getElementById("resumeOutput");

  // LinkedIn elements
  const linkedinPdf = document.getElementById("linkedinPdf");
  const extractLinkedinPdfBtn = document.getElementById("extractLinkedinPdf");
  const linkedinPdfStatus = document.getElementById("linkedinPdfStatus");
  const linkedinText = document.getElementById("linkedinText");
  const linkedinTargetRole = document.getElementById("linkedinTargetRole");
  const runLinkedInReviewBtn = document.getElementById("runLinkedInReview");
  const linkedinOutput = document.getElementById("linkedinOutput");

  // --- Helpers ---
  function showSection(sectionEl) {
    if (!sectionEl) return;
    sectionEl.classList.remove("hidden");
    sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setStatus(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
  }

  function isPdfFile(file) {
    if (!file) return false;
    if (file.type === "application/pdf") return true;
    return /\.pdf$/i.test(file.name || "");
  }

  // --- Start buttons ---
  if (startResumeBtn) startResumeBtn.addEventListener("click", () => showSection(resumeSection));
  if (startLinkedInBtn) startLinkedInBtn.addEventListener("click", () => showSection(linkedinSection));

  // --- PDF.js worker ---
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // --- PDF extraction core ---
  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js failed to load.");
    if (!isPdfFile(file)) throw new Error("Selected file is not a PDF.");

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map(i => i.str).filter(Boolean);
      fullText += strings.join(" ") + "\n\n";
    }

    return normalize(fullText);
  }

  function normalize(t) {
    return String(t || "")
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ===============================
  // Resume PDF extraction
  // ===============================
  if (extractResumePdfBtn) {
    extractResumePdfBtn.addEventListener("click", async () => {
      try {
        setStatus(resumePdfStatus, "");

        if (!resumePdf?.files?.[0]) {
          setStatus(resumePdfStatus, "Choose a resume PDF first.");
          return;
        }

        setStatus(resumePdfStatus, "Extracting resume text…");
        const text = await extractPdfText(resumePdf.files[0]);

        resumeText.value = text;
        setStatus(resumePdfStatus, "Extracted. Review and edit if needed.");
      } catch (e) {
        console.error(e);
        setStatus(resumePdfStatus, "Resume PDF extraction failed.");
      }
    });
  }

  // ===============================
  // LinkedIn PDF extraction  ✅ FIX
  // ===============================
  if (extractLinkedinPdfBtn) {
    extractLinkedinPdfBtn.addEventListener("click", async () => {
      try {
        setStatus(linkedinPdfStatus, "");

        if (!linkedinPdf?.files?.[0]) {
          setStatus(linkedinPdfStatus, "Choose a LinkedIn PDF first.");
          return;
        }

        setStatus(linkedinPdfStatus, "Extracting LinkedIn profile text…");
        const text = await extractPdfText(linkedinPdf.files[0]);

        // ALWAYS populate textarea (same as resume)
        linkedinText.value = text || "";

        setStatus(
          linkedinPdfStatus,
          text.length < 40
            ? "LinkedIn PDF text is limited or fragmented. Review and add missing sections if needed."
            : "Extracted. Review and edit if needed."
        );
      } catch (e) {
        console.error(e);
        setStatus(linkedinPdfStatus, "LinkedIn PDF extraction failed.");
      }
    });
  }

  // --- Resume review call ---
  if (runResumeReviewBtn) {
    runResumeReviewBtn.addEventListener("click", async () => {
      try {
        const text = normalize(resumeText.value);
        if (text.length < 120) return;

        resumeOutput.innerHTML = "Generating…";
        const res = await fetch(RESUME_REVIEW_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText: text, targetRole: resumeTargetRole.value }),
        });

        const data = await res.json();
        resumeOutput.innerHTML = data.html;
      } catch (e) {
        resumeOutput.innerHTML = "Resume review failed.";
      }
    });
  }

  // --- LinkedIn review call ---
  if (runLinkedInReviewBtn) {
    runLinkedInReviewBtn.addEventListener("click", async () => {
      try {
        const text = normalize(linkedinText.value);
        if (text.length < 120) return;

        linkedinOutput.innerHTML = "Generating…";
        const res = await fetch(LINKEDIN_REVIEW_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedinText: text, targetRole: linkedinTargetRole.value }),
        });

        const data = await res.json();
        linkedinOutput.innerHTML = data.html;
      } catch (e) {
        linkedinOutput.innerHTML = "LinkedIn review failed.";
      }
    });
  }
});
