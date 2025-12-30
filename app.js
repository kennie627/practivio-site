/* =========================
Engineering Mentor - app.js
Fixes:
- Start buttons show/scroll to sections
- PDF.js worker set (PDF extraction works)
- LinkedIn review endpoint works
========================= */

const GOOGLE_BOOKING_LINK = ""; // paste your Google appointment URL here

// Elements
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

// Set booking link
bookMentorship.href = GOOGLE_BOOKING_LINK || "#";
if (!GOOGLE_BOOKING_LINK) {
  bookMentorship.addEventListener("click", (e) => {
    e.preventDefault();
    alert("Paste your Google appointment URL into app.js (GOOGLE_BOOKING_LINK) and redeploy.");
  });
}

// Helpers
function showSection(sectionEl) {
  sectionEl.classList.remove("hidden");
  sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setOutput(el, html) {
  el.innerHTML = html;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderError(msg) {
  return `<div class="notice"><strong>Action needed:</strong> ${escapeHtml(msg)}</div>`;
}

// Start buttons
startResumeBtn.addEventListener("click", () => showSection(resumeSection));
startLinkedInBtn.addEventListener("click", () => showSection(linkedinSection));

// PDF.js worker setup (this is the usual cause of extraction failures)
if (window.pdfjsLib) {
  // Match the same version you loaded in index.html
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// PDF extraction
extractPdfBtn.addEventListener("click", async () => {
  try {
    pdfStatus.textContent = "";

    if (!resumePdf.files || !resumePdf.files[0]) {
      pdfStatus.textContent = "Choose a PDF first.";
      return;
    }

    if (!window.pdfjsLib) {
      pdfStatus.textContent = "PDF.js failed to load. Refresh the page and try again.";
      return;
    }

    const file = resumePdf.files[0];
    const buffer = await file.arrayBuffer();

    pdfStatus.textContent = "Extracting text…";

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str);
      fullText += strings.join(" ") + "\n\n";
    }

    const cleaned = fullText.replace(/\s+\n/g, "\n").trim();

    if (!cleaned || cleaned.length < 50) {
      pdfStatus.textContent = "PDF extracted, but text looks empty. Use paste text instead.";
      return;
    }

    resumeText.value = cleaned;
    pdfStatus.textContent = "Extracted. Review the text and run the resume review below.";
  } catch (err) {
    console.error(err);
    pdfStatus.textContent = "PDF extraction failed. Use paste text instead.";
  }
});

// API calls
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || "Unknown error" };
  }

  if (!res.ok) {
    const msg հավել = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

// Resume review
runResumeReviewBtn.addEventListener("click", async () => {
  try {
    const text = (resumeText.value || "").trim();
    if (text.length < 50) {
      setOutput(resumeOutput, renderError("Paste more resume text (at least a few sections) and try again."));
      return;
    }

    setOutput(resumeOutput, `<div class="notice">Generating your resume review…</div>`);

    const data = await postJson("/.netlify/functions/reviewResume", {
      resumeText: text,
    });

    setOutput(resumeOutput, data.html || `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`);
  } catch (err) {
    console.error(err);
    setOutput(resumeOutput, renderError(err.message || "Resume review failed. Try again."));
  }
});

// LinkedIn review
runLinkedInReviewBtn.addEventListener("click", async () => {
  try {
    const text = (linkedinText.value || "").trim();
    const target = (linkedinTargetRole.value || "").trim();

    if (text.length < 50) {
      setOutput(linkedinOutput, renderError("Paste your LinkedIn profile text (headline/about/experience) and try again."));
      return;
    }

    setOutput(linkedinOutput, `<div class="notice">Generating your LinkedIn review…</div>`);

    const data = await postJson("/.netlify/functions/reviewLinkedIn", {
      linkedinText: text,
      targetRole: target,
    });

    setOutput(linkedinOutput, data.html || `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`);
  } catch (err) {
    console.error(err);
    setOutput(linkedinOutput, renderError(err.message || "LinkedIn review failed. Try again."));
  }
});
