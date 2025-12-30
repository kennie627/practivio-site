// Engineering Mentor - app.js
// Fixes: start buttons, PDF extraction, LinkedIn review calls, clearer errors.

const GOOGLE_BOOKING_LINK = ""; // paste your Google appointment URL here

document.addEventListener("DOMContentLoaded", () => {
  const startResumeBtn = document.getElementById("startResume");
  const startLinkedInBtn = document.getElementById("startLinkedIn");

  const resumeSection = document.getElementById("resumeSection");
  const linkedinSection = document.getElementById("linkedinSection");

  const resumePdf = document.getElementById("resumePdf");
  const extractPdfBtn = document.getElementById("extractPdf");
  const pdfStatus = document.getElementById("pdfStatus");
  const resumeText = document.getElementById("resumeText");
  const runResumeReviewBtn = document.getElementById("runResumeReview");
  const resumeOutput = document.getElementById("resumeOutput");

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

  // Helpers
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function notice(msg) {
    return `<div class="notice">${escapeHtml(msg)}</div>`;
  }

  function showSection(sectionEl) {
    if (!sectionEl) return;
    sectionEl.classList.remove("hidden");
    sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Start buttons (these were not binding before)
  if (startResumeBtn) startResumeBtn.addEventListener("click", () => showSection(resumeSection));
  if (startLinkedInBtn) startLinkedInBtn.addEventListener("click", () => showSection(linkedinSection));

  // PDF.js worker setup (this is the #1 reason extraction fails)
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

  // PDF extraction button
  if (extractPdfBtn) {
    extractPdfBtn.addEventListener("click", async () => {
      try {
        if (!pdfStatus) return;
        pdfStatus.textContent = "";

        if (!resumePdf || !resumePdf.files || !resumePdf.files[0]) {
          pdfStatus.textContent = "Choose a PDF first.";
          return;
        }

        if (!window.pdfjsLib) {
          pdfStatus.textContent = "PDF.js failed to load. Hard refresh and try again.";
          return;
        }

        pdfStatus.textContent = "Extracting text…";
        const text = await extractPdfText(resumePdf.files[0]);

        if (!text || text.length < 80) {
          pdfStatus.textContent = "PDF extracted but looks empty/messy. Use paste text instead.";
          return;
        }

        resumeText.value = text;
        pdfStatus.textContent = "Extracted. Now click Generate Detailed Resume Review.";
      } catch (e) {
        console.error(e);
        if (pdfStatus) pdfStatus.textContent = "PDF extraction failed. Use paste text instead.";
      }
    });
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

  // Resume review
  if (runResumeReviewBtn) {
    runResumeReviewBtn.addEventListener("click", async () => {
      try {
        const text = (resumeText?.value || "").trim();
        if (text.length < 80) {
          resumeOutput.innerHTML = notice("Paste more resume text (at least a few sections) then try again.");
          return;
        }

        resumeOutput.innerHTML = notice("Generating your resume review…");

        const data = await postJson("/.netlify/functions/reviewResume", {
          resumeText: text,
        });

        resumeOutput.innerHTML = data.html || `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      } catch (e) {
        console.error(e);
        resumeOutput.innerHTML = notice(e.message || "Resume review failed.");
      }
    });
  }

  // LinkedIn review
  if (runLinkedInReviewBtn) {
    runLinkedInReviewBtn.addEventListener("click", async () => {
      try {
        const text = (linkedinText?.value || "").trim();
        const targetRole = (linkedinTargetRole?.value || "").trim();

        if (text.length < 80) {
          linkedinOutput.innerHTML = notice("Paste your LinkedIn profile text (headline/about/experience) then try again.");
          return;
        }

        linkedinOutput.innerHTML = notice("Generating your LinkedIn review…");

        const data = await postJson("/.netlify/functions/reviewLinkedIn", {
          linkedinText: text,
          targetRole,
        });

        linkedinOutput.innerHTML = data.html || `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      } catch (e) {
        console.error(e);
        linkedinOutput.innerHTML = notice(e.message || "LinkedIn review failed.");
      }
    });
  }
});
