// Engineering Mentor - app.js
// Fixes: start buttons, resume PDF extraction, LinkedIn PDF extraction, review calls.

const GOOGLE_BOOKING_LINK = ""; // paste your Google appointment URL here

document.addEventListener("DOMContentLoaded", () => {
  const startResumeBtn = document.getElementById("startResume");
  const startLinkedInBtn = document.getElementById("startLinkedIn");

  const resumeSection = document.getElementById("resumeSection");
  const linkedinSection = document.getElementById("linkedinSection");

  const resumePdf = document.getElementById("resumePdf");
  const extractResumePdfBtn = document.getElementById("extractPdf");
  const resumePdfStatus = document.getElementById("pdfStatus");
  const resumeText = document.getElementById("resumeText");
  const resumeTargetRole = document.getElementById("resumeTargetRole");
  const runResumeReviewBtn = document.getElementById("runResumeReview");
  const resumeOutput = document.getElementById("resumeOutput");

  const linkedinPdf = document.getElementById("linkedinPdf");
  const extractLinkedinPdfBtn = document.getElementById("extractLinkedinPdf");
  const linkedinPdfStatus = document.getElementById("linkedinPdfStatus");
  const linkedinText = document.getElementById("linkedinText");
  const linkedinTargetRole = document.getElementById("linkedinTargetRole");
  const runLinkedInReviewBtn = document.getElementById("runLinkedInReview");
  const linkedinOutput = document.getElementById("linkedinOutput");

  const bookMentorship = document.getElementById("bookMentorship");

  // Booking link
  if (bookMentorship) {
    bookMentorship.href = GOOGLE_BOOKING_LINK || "#";
    if (!GOOGLE_BOOKING_LINK) {
      bookMentorship.addEventListener("click", (e) => {
        e.preventDefault();
        alert("Paste your Google appointment URL into app.js (GOOGLE_BOOKING_LINK) then push to redeploy.");
      });
    }
  }

  function showSection(sectionEl) {
    if (!sectionEl) return;
    sectionEl.classList.remove("hidden");
    sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (startResumeBtn) startResumeBtn.addEventListener("click", () => showSection(resumeSection));
  if (startLinkedInBtn) startLinkedInBtn.addEventListener("click", () => showSection(linkedinSection));

  // PDF.js worker setup (required for reliable extraction)
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  async function extractPdfText(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str);
      fullText += strings.join(" ") + "\n\n";
    }

    return fullText
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { data = { error: raw || "Unknown error" }; }

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // Resume PDF extraction
  if (extractResumePdfBtn) {
    extractResumePdfBtn.addEventListener("click", async () => {
      try {
        resumePdfStatus.textContent = "";

        if (!resumePdf.files || !resumePdf.files[0]) {
          resumePdfStatus.textContent = "Choose a resume PDF first.";
          return;
        }
        if (!window.pdfjsLib) {
          resumePdfStatus.textContent = "PDF extraction library failed to load. Hard refresh and try again.";
          return;
        }

        resumePdfStatus.textContent = "Extracting resume text…";
        const text = await extractPdfText(resumePdf.files[0]);

        if (!text || text.length < 120) {
          resumePdfStatus.textContent = "Extracted text looks empty or messy. Use paste text instead.";
          return;
        }

        resumeText.value = text;
        resumePdfStatus.textContent = "Extracted. Now click Generate Detailed Resume Review.";
      } catch (e) {
        console.error(e);
        resumePdfStatus.textContent = "Resume PDF extraction failed. Use paste text instead.";
      }
    });
  }

  // LinkedIn PDF extraction
  if (extractLinkedinPdfBtn) {
    extractLinkedinPdfBtn.addEventListener("click", async () => {
      try {
        linkedinPdfStatus.textContent = "";

        if (!linkedinPdf.files || !linkedinPdf.files[0]) {
          linkedinPdfStatus.textContent = "Choose a LinkedIn PDF first.";
          return;
        }
        if (!window.pdfjsLib) {
          linkedinPdfStatus.textContent = "PDF extraction library failed to load. Hard refresh and try again.";
          return;
        }

        linkedinPdfStatus.textContent = "Extracting LinkedIn text…";
        const text = await extractPdfText(linkedinPdf.files[0]);

        if (!text || text.length < 120) {
          linkedinPdfStatus.textContent = "Extracted text looks empty or messy. Use paste text instead.";
          return;
        }

        linkedinText.value = text;
        linkedinPdfStatus.textContent = "Extracted. Now click Generate Detailed LinkedIn Review.";
      } catch (e) {
        console.error(e);
        linkedinPdfStatus.textContent = "LinkedIn PDF extraction failed. Use paste text instead.";
      }
    });
  }

  // Resume review
  if (runResumeReviewBtn) {
    runResumeReviewBtn.addEventListener("click", async () => {
      try {
        const text = (resumeText.value || "").trim();
        const targetRole = (resumeTargetRole.value || "").trim();

        if (text.length < 120) {
          resumeOutput.innerHTML = `<div class="notice">Paste more resume text (at least a few sections) then try again.</div>`;
          return;
        }

        resumeOutput.innerHTML = `<div class="notice">Generating your resume review…</div>`;

        const data = await postJson("/.netlify/functions/reviewResume", {
          resumeText: text,
          targetRole
        });

        resumeOutput.innerHTML = data.html;
      } catch (e) {
        console.error(e);
        resumeOutput.innerHTML = `<div class="notice">Resume review failed: ${String(e.message || e)}</div>`;
      }
    });
  }

  // LinkedIn review
  if (runLinkedInReviewBtn) {
    runLinkedInReviewBtn.addEventListener("click", async () => {
      try {
        const text = (linkedinText.value || "").trim();
        const targetRole = (linkedinTargetRole.value || "").trim();

        if (text.length < 120) {
          linkedinOutput.innerHTML = `<div class="notice">Paste more LinkedIn profile text (headline/about/experience) then try again.</div>`;
          return;
        }

        linkedinOutput.innerHTML = `<div class="notice">Generating your LinkedIn review…</div>`;

        const data = await postJson("/.netlify/functions/reviewLinkedIn", {
          linkedinText: text,
          targetRole
        });

        linkedinOutput.innerHTML = data.html;
      } catch (e) {
        console.error(e);
        linkedinOutput.innerHTML = `<div class="notice">LinkedIn review failed: ${String(e.message || e)}</div>`;
      }
    });
  }
});
