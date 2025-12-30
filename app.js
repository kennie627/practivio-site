/* global pdfjsLib */

const resumePdf = document.getElementById('resumePdf');
const extractPdfBtn = document.getElementById('extractPdfBtn');
const pdfStatus = document.getElementById('pdfStatus');
const resumeText = document.getElementById('resumeText');
const resumeTargetRole = document.getElementById('resumeTargetRole');
const runResumeReviewBtn = document.getElementById('runResumeReviewBtn');
const resumeRunStatus = document.getElementById('resumeRunStatus');
const resumeResults = document.getElementById('resumeResults');

const linkedinText = document.getElementById('linkedinText');
const linkedinTargetRole = document.getElementById('linkedinTargetRole');
const runLinkedinReviewBtn = document.getElementById('runLinkedinReviewBtn');
const linkedinRunStatus = document.getElementById('linkedinRunStatus');
const linkedinResults = document.getElementById('linkedinResults');

document.querySelectorAll('[data-scroll]').forEach(btn => {
  btn.addEventListener('click', () => {
    const sel = btn.getAttribute('data-scroll');
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Replace this once you paste your Google appointment schedule link
const GOOGLE_BOOKING_LINK = ""; // e.g. "https://calendar.google.com/calendar/appointments/schedules/..."
const bookBtn = document.getElementById('bookBtn');
const bookBtn2 = document.getElementById('bookBtn2');

function wireBookingLink() {
  if (GOOGLE_BOOKING_LINK && GOOGLE_BOOKING_LINK.startsWith('http')) {
    bookBtn.href = GOOGLE_BOOKING_LINK;
    bookBtn.target = "_blank";
    bookBtn.rel = "noopener";
    bookBtn2.href = GOOGLE_BOOKING_LINK;
    bookBtn2.target = "_blank";
    bookBtn2.rel = "noopener";
  }
}
wireBookingLink();

function setStatus(el, msg) {
  el.textContent = msg || "";
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function extractTextFromPdf(file) {
  pdfStatus.textContent = "Loading PDF...";
  const arrayBuffer = await file.arrayBuffer();

  // pdf.js worker
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.js";
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    setStatus(pdfStatus, `Extracting text… page ${i} of ${pdf.numPages}`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str);
    fullText += strings.join(" ") + "\n";
  }

  setStatus(pdfStatus, `Done. Extracted ~${fullText.length.toLocaleString()} characters.`);
  return fullText.trim();
}

extractPdfBtn.addEventListener('click', async () => {
  try {
    const file = resumePdf.files?.[0];
    if (!file) {
      setStatus(pdfStatus, "Please choose a PDF first.");
      return;
    }
    if (file.type !== "application/pdf") {
      setStatus(pdfStatus, "That file doesn’t look like a PDF.");
      return;
    }
    const txt = await extractTextFromPdf(file);
    resumeText.value = txt;
  } catch (err) {
    console.error(err);
    setStatus(pdfStatus, "PDF extraction failed. Use paste text instead.");
  }
});

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function verdictBadge(verdict) {
  const v = (verdict || "").toLowerCase();
  if (v.includes("ready")) return `<span class="badge good">Verdict: ${escapeHtml(verdict)}</span>`;
  if (v.includes("not yet") || v.includes("unclear")) return `<span class="badge bad">Verdict: ${escapeHtml(verdict)}</span>`;
  return `<span class="badge warn">Verdict: ${escapeHtml(verdict || "—")}</span>`;
}

function renderResumeResults(r) {
  const breakdown = r.scoreBreakdown || {};
  const scoreHtml = `
    <div class="kv">
      <div class="item"><div class="label">Overall score</div><div class="value">${escapeHtml(String(r.scoreOverall ?? "—"))}</div></div>
      <div class="item"><div class="label">Role clarity</div><div class="value">${escapeHtml(String(breakdown.roleClarity ?? "—"))}</div></div>
      <div class="item"><div class="label">Projects strength</div><div class="value">${escapeHtml(String(breakdown.projects ?? "—"))}</div></div>
      <div class="item"><div class="label">Impact bullets</div><div class="value">${escapeHtml(String(breakdown.impactBullets ?? "—"))}</div></div>
      <div class="item"><div class="label">Skills credibility</div><div class="value">${escapeHtml(String(breakdown.skillsCredibility ?? "—"))}</div></div>
      <div class="item"><div class="label">ATS readability</div><div class="value">${escapeHtml(String(breakdown.atsReadability ?? "—"))}</div></div>
    </div>
  `;

  const sections = (r.sectionCritique || []).map(s => `
    <div class="result-block">
      <h3>${escapeHtml(s.title || "Section")}</h3>
      <div class="muted small">${escapeHtml(s.summary || "")}</div>
      ${(s.findings?.length ? `<ul class="list">${s.findings.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "")}
    </div>
  `).join("");

  const rewrites = (r.rewriteExamples || []).map((x, idx) => `
    <div class="result-block">
      <h3>Rewrite Example ${idx + 1}: ${escapeHtml(x.label || "")}</h3>
      <div class="copyrow">
        <button class="btn ghost" data-copy="${escapeHtml(x.text || "")}">Copy</button>
        <div class="codebox">${escapeHtml(x.text || "")}</div>
      </div>
    </div>
  `).join("");

  const plan = (r.next7DaysPlan || []);
  const planHtml = plan.length
    ? `<ol class="list">${plan.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ol>`
    : `<div class="muted">No plan returned.</div>`;

  resumeResults.innerHTML = `
    <div class="result-block">
      <h3>Readiness + Biggest Issue</h3>
      <div class="copyrow">
        ${verdictBadge(r.verdict)}
        <span class="badge warn">Biggest issue: ${escapeHtml(r.biggestIssue || "—")}</span>
      </div>
      <p class="muted">${escapeHtml(r.realityCheck || "")}</p>
    </div>

    <div class="result-block">
      <h3>Scorecard</h3>
      ${scoreHtml}
    </div>

    <div class="result-block">
      <h3>Section-by-section critique</h3>
      <div class="muted small">This is written like a hiring manager scanning for signal. Fix the biggest issues first.</div>
    </div>

    ${sections}

    <div class="result-block">
      <h3>Rewrite Examples</h3>
      <div class="muted small">Use these patterns across your resume. Copy and adjust for your actual work.</div>
    </div>

    ${rewrites}

    <div class="result-block">
      <h3>Your Next 7 Days Plan</h3>
      ${planHtml}
    </div>
  `;

  resumeResults.hidden = false;
  hookCopyButtons(resumeResults);
}

function renderLinkedInResults(r) {
  const headOpts = (r.headlineOptions || []).map((h, idx) => `
    <div class="result-block">
      <h3>Headline Option ${idx + 1}</h3>
      <div class="copyrow">
        <button class="btn ghost" data-copy="${escapeHtml(h)}">Copy</button>
        <div class="codebox">${escapeHtml(h)}</div>
      </div>
    </div>
  `).join("");

  const about = `
    <div class="result-block">
      <h3>About Section Rewrite</h3>
      <div class="copyrow">
        <button class="btn ghost" data-copy="${escapeHtml(r.aboutRewrite || "")}">Copy</button>
        <div class="codebox">${escapeHtml(r.aboutRewrite || "")}</div>
      </div>
    </div>
  `;

  const listsBlock = (title, arr) => `
    <div class="result-block">
      <h3>${escapeHtml(title)}</h3>
      ${arr?.length ? `<ul class="list">${arr.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<div class="muted">None provided.</div>`}
    </div>
  `;

  linkedinResults.innerHTML = `
    <div class="result-block">
      <h3>Positioning Verdict</h3>
      <div class="copyrow">
        ${verdictBadge(r.positioningVerdict || "—")}
        <span class="badge warn">Biggest issue: ${escapeHtml(r.biggestIssue || "—")}</span>
      </div>
      <p class="muted">${escapeHtml(r.realityCheck || "")}</p>
    </div>

    ${headOpts}
    ${about}

    ${listsBlock("Experience fixes", r.experienceFixes)}
    ${listsBlock("Project fixes", r.projectFixes)}
    ${listsBlock("Skills cleanup", r.skillsCleanup)}
    ${listsBlock("Network plan", r.networkPlan)}
    ${listsBlock("Next steps", r.nextSteps)}
  `;

  linkedinResults.hidden = false;
  hookCopyButtons(linkedinResults);
}

function hookCopyButtons(root) {
  root.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const txt = btn.getAttribute('data-copy') || "";
      try {
        await navigator.clipboard.writeText(txt);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      }
    });
  });
}

runResumeReviewBtn.addEventListener('click', async () => {
  try {
    setStatus(resumeRunStatus, "");
    resumeResults.hidden = true;

    const txt = (resumeText.value || "").trim();
    if (txt.length < 300) {
      setStatus(resumeRunStatus, "Paste more resume text (or extract from PDF).");
      return;
    }

    setStatus(resumeRunStatus, "Generating review...");
    const data = await postJson("/.netlify/functions/reviewResume", {
      text: txt,
      targetRole: (resumeTargetRole.value || "").trim()
    });

    setStatus(resumeRunStatus, "Done.");
    renderResumeResults(data);
  } catch (err) {
    console.error(err);
    setStatus(resumeRunStatus, err.message || "Resume review failed.");
  }
});

runLinkedinReviewBtn.addEventListener('click', async () => {
  try {
    setStatus(linkedinRunStatus, "");
    linkedinResults.hidden = true;

    const txt = (linkedinText.value || "").trim();
    if (txt.length < 200) {
      setStatus(linkedinRunStatus, "Paste more LinkedIn profile text.");
      return;
    }

    setStatus(linkedinRunStatus, "Generating review...");
    const data = await postJson("/.netlify/functions/reviewLinkedIn", {
      text: txt,
      targetRole: (linkedinTargetRole.value || "").trim()
    });

    setStatus(linkedinRunStatus, "Done.");
    renderLinkedInResults(data);
  } catch (err) {
    console.error(err);
    setStatus(linkedinRunStatus, err.message || "LinkedIn review failed.");
  }
});
