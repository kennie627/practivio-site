// app.js
// Engineering Mentor — Frontend logic
// - Reliable PDF extraction (resume + LinkedIn) via PDF.js worker
// - Start buttons scroll to sections
// - Calls Netlify Functions that now use OpenAI (gpt-4.1-nano)
//
// NOTE: Paste your Google appointment URL below.

const GOOGLE_BOOKING_LINK = ""; // e.g. "https://calendar.google.com/calendar/u/0/appointments/schedules/XXXX"

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

  // Mentorship booking button/link
  const bookMentorship = document.getElementById("bookMentorship");

  // --- Booking link wiring ---
  if (bookMentorship) {
    bookMentorship.href = GOOGLE_BOOKING_LINK || "#";
    if (!GOOGLE_BOOKING_LINK) {
      bookMentorship.addEventListener("click", (e) => {
        e.preventDefault();
        alert("Paste your Google appointment URL into app.js (GOOGLE_BOOKING_LINK), then commit + push to redeploy.");
      });
    }
  }

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

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw || "Unknown error" };
    }

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // --- Start buttons ---
  if (startResumeBtn) startResumeBtn.addEventListener("click", () => showSection(resumeSection));
  if (startLinkedInBtn) startLinkedInBtn.addEventListener("click", () => showSection(linkedinSection));

  // --- PDF.js worker setup (required for reliable extraction) ---
  // Make sure index.html includes PDF.js:
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  // (worker is set here)
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // --- PDF extraction ---
  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js failed to load.");
    if (!isPdfFile(file)) throw new Error("Selected file is not a PDF.");

    const buffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: buffer });

    // In some environments, PDF.js will throw cryptic errors; catch and rethrow cleanly.
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (e) {
      throw new Error("PDF could not be read. If this is a scanned image PDF, use paste text instead.");
    }

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // PDF.js text order can be weird; joining with spaces is usually best.
      const content = await page.getTextContent({
        includeMarkedContent: false,
        disableCombineTextItems: false,
      });

      const strings = content.items
        .map((it) => (it && typeof it.str === "string" ? it.str : ""))
        .filter(Boolean);

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

  // --- Resume PDF extraction button ---
  if (extractResumePdfBtn) {
    extractResumePdfBtn.addEventListener("click", async () => {
      try {
        setStatus(resumePdfStatus, "");

        if (!resumePdf || !resumePdf.files || !resumePdf.files[0]) {
          setStatus(resumePdfStatus, "Choose a resume PDF first.");
          return;
        }
        if (!window.pdfjsLib) {
          setStatus(resumePdfStatus, "PDF extraction library failed to load. Hard refresh (Cmd+Shift+R) and try again.");
          return;
        }

        const file = resumePdf.files[0];
        if (!isPdfFile(file)) {
          setStatus(resumePdfStatus, "That file does not look like a PDF. Please upload a .pdf file.");
          return;
        }

        setStatus(resumePdfStatus, "Extracting resume text…");
        const text = await extractPdfText(file);

        if (!text || text.length < 120) {
          setStatus(resumePdfStatus, "Extracted text looks empty or messy. Use paste text instead.");
          return;
        }

        if (resumeText) resumeText.value = text;
        setStatus(resumePdfStatus, "Extracted. Now click Generate Detailed Resume Review.");
      } catch (e) {
        console.error(e);
        setStatus(
          resumePdfStatus,
          "Resume PDF extraction failed. If this PDF is scanned (image-only), use paste text instead."
        );
      }
    });
  }

  // --- LinkedIn PDF extraction button ---
  if (extractLinkedinPdfBtn) {
    extractLinkedinPdfBtn.addEventListener("click", async () => {
      try {
        setStatus(linkedinPdfStatus, "");

        if (!linkedinPdf || !linkedinPdf.files || !linkedinPdf.files[0]) {
          setStatus(linkedinPdfStatus, "Choose a LinkedIn PDF first.");
          return;
        }
        if (!window.pdfjsLib) {
          setStatus(linkedinPdfStatus, "PDF extraction library failed to load. Hard refresh (Cmd+Shift+R) and try again.");
          return;
        }

        const file = linkedinPdf.files[0];
        if (!isPdfFile(file)) {
          setStatus(linkedinPdfStatus, "That file does not look like a PDF. Please upload a .pdf file.");
          return;
        }

        setStatus(linkedinPdfStatus, "Extracting LinkedIn text…");
        const text = await extractPdfText(file);

        if (!text || text.length < 120) {
          setStatus(linkedinPdfStatus, "Extracted text looks empty or messy. Use paste text instead.");
          return;
        }

        if (linkedinText) linkedinText.value = text;
        setStatus(linkedinPdfStatus, "Extracted. Now click Generate Detailed LinkedIn Review.");
      } catch (e) {
        console.error(e);
        setStatus(
          linkedinPdfStatus,
          "LinkedIn PDF extraction failed. If this PDF is scanned (image-only), use paste text instead."
        );
      }
    });
  }

  // --- Resume review call ---
  if (runResumeReviewBtn) {
    runResumeReviewBtn.addEventListener("click", async () => {
      try {
        const text = normalize(resumeText?.value || "");
        const targetRole = normalize(resumeTargetRole?.value || "");

        if (text.length < 120) {
          if (resumeOutput) resumeOutput.innerHTML = `<div class="notice">Paste more resume text (at least a few sections) then try again.</div>`;
          return;
        }

        if (resumeOutput) resumeOutput.innerHTML = `<div class="notice">Generating your resume review…</div>`;

        const data = await postJson("/.netlify/functions/reviewResume", {
          resumeText: text,
          targetRole,
        });

        if (resumeOutput) resumeOutput.innerHTML = data.html || `<div class="notice">No output returned.</div>`;
      } catch (e) {
        console.error(e);
        if (resumeOutput) resumeOutput.innerHTML = `<div class="notice">Resume review failed: ${String(e.message || e)}</div>`;
      }
    });
  }

  // --- LinkedIn review call ---
  if (runLinkedInReviewBtn) {
    runLinkedInReviewBtn.addEventListener("click", async () => {
      try {
        const text = normalize(linkedinText?.value || "");
        const targetRole = normalize(linkedinTargetRole?.value || "");

        if (text.length < 120) {
          if (linkedinOutput) {
            linkedinOutput.innerHTML = `<div class="notice">Paste more LinkedIn profile text (headline/about/experience) then try again.</div>`;
          }
          return;
        }

        if (linkedinOutput) linkedinOutput.innerHTML = `<div class="notice">Generating your LinkedIn review…</div>`;

        const data = await postJson("/.netlify/functions/reviewLinkedIn", {
          linkedinText: text,
          targetRole,
        });

        if (linkedinOutput) linkedinOutput.innerHTML = data.html || `<div class="notice">No output returned.</div>`;
      } catch (e) {
        console.error(e);
        if (linkedinOutput) linkedinOutput.innerHTML = `<div class="notice">LinkedIn review failed: ${String(e.message || e)}</div>`;
      }
    });
  }
});
