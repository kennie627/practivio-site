export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const body = safeJson(event.body);
    const resumeTextRaw = (body.resumeText || "").trim();
    const targetRole = (body.targetRole || "").trim();

    if (resumeTextRaw.length < 120) {
      return json(400, { error: "Resume text is too short. Paste more content." });
    }

    const resumeText = normalize(resumeTextRaw);

    const analysis = analyzeResume(resumeText, targetRole);
    const html = renderResumeReview(analysis);

    return json(200, { html });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || "Server error" });
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
function safeJson(raw) { try { return JSON.parse(raw || "{}"); } catch { return {}; } }
function normalize(t) {
  return t
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasAny(text, needles) {
  const t = text.toLowerCase();
  return needles.some(n => t.includes(n.toLowerCase()));
}

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

function analyzeResume(text, targetRole) {
  const lower = text.toLowerCase();

  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasPhone = /(\+?\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(text);
  const hasLinkedIn = lower.includes("linkedin.com");

  const hasEducation = hasAny(text, ["education", "university", "college", "bachelor", "master", "b.s.", "m.s.", "beng", "meng"]);
  const hasProjects = hasAny(text, ["projects", "project:"]);
  const hasSkills = hasAny(text, ["skills", "tools", "technologies"]);
  const hasExperience = hasAny(text, ["experience", "employment", "work history"]);

  const hasGpa = /gpa\s*[:]?/i.test(text) || /\b[0-4]\.\d{1,2}\b/.test(text);
  const hasMetrics = /(\b\d{1,3}%\b|\b\d{3,}\b|\b\$?\d+(,\d{3})*\b)/.test(text);

  const roleSignals = [
    { name: "Electrical", keys: ["electrical", "pcb", "pcba", "schematic", "altium", "kicad", "power electronics"] },
    { name: "Mechanical", keys: ["mechanical", "solidworks", "cad", "fea", "gd&t"] },
    { name: "Systems", keys: ["systems", "requirements", "integration", "verification", "validation", "v&v"] },
    { name: "Test", keys: ["test", "ate", "labview", "validation test", "functional test", "ict"] },
    { name: "Software", keys: ["software", "python", "c++", "javascript", "git"] },
    { name: "Manufacturing", keys: ["manufacturing", "smt", "yield", "lean", "six sigma", "process"] }
  ];

  const detectedRoles = roleSignals
    .map(r => ({ role: r.name, hits: r.keys.filter(k => lower.includes(k)).length }))
    .filter(r => r.hits > 0)
    .sort((a,b) => b.hits - a.hits);

  const multiRole = detectedRoles.length >= 3 && (detectedRoles[0].hits - detectedRoles[2].hits) <= 2;

  const atsRisk = hasAny(text, ["|", "•  •", "graphic", "icon"]) ? "possible" : "low";

  const score = {
    roleClarity: clamp(30 + (targetRole ? 20 : 0) + (detectedRoles.length ? 15 : 0) - (multiRole ? 20 : 0), 0, 100),
    impactBullets: clamp(25 + (hasMetrics ? 30 : 0) + countMatches(text, /\b(improved|reduced|increased|delivered|validated|designed|implemented|debugged|troubleshot)\b/gi) * 3, 0, 100),
    projects: clamp(30 + (hasProjects ? 35 : 0), 0, 100),
    atsReadability: clamp(70 + (atsRisk === "low" ? 15 : 0) - (atsRisk === "possible" ? 10 : 0), 0, 100),
    completeness: clamp(
      20 +
      (hasEmail ? 15 : 0) +
      (hasPhone ? 10 : 0) +
      (hasLinkedIn ? 10 : 0) +
      (hasEducation ? 15 : 0) +
      (hasExperience ? 15 : 0) +
      (hasSkills ? 10 : 0) +
      (hasProjects ? 5 : 0),
      0, 100
    )
  };

  const overall = Math.round((score.roleClarity + score.impactBullets + score.projects + score.atsReadability + score.completeness) / 5);

  const biggestOpportunity = !targetRole && detectedRoles.length > 1
    ? "Your target role is not clear. Hiring teams will not guess where you fit."
    : !hasMetrics
      ? "Your bullets read like duties. You need impact bullets with constraints and results."
      : !hasProjects
        ? "You need a Projects section that proves engineering thinking and decisions."
        : "Tighten your top third so it reads as a clear match in under 10 seconds.";

  const readiness =
    overall >= 80 ? "Job-ready for most entry-level pipelines (still tailor per role)."
    : overall >= 65 ? "Close, but not interview-ready yet. Fix the top issues before applying hard."
    : "Not ready yet. You have good content, but the resume is not functioning as a hiring document.";

  return {
    targetRole,
    detectedRoles,
    multiRole,
    flags: { hasEmail, hasPhone, hasLinkedIn, hasEducation, hasExperience, hasSkills, hasProjects, hasGpa, hasMetrics, atsRisk },
    score,
    overall,
    biggestOpportunity,
    readiness
  };
}

function renderResumeReview(a) {
  const detected = a.detectedRoles.length
    ? a.detectedRoles.slice(0, 3).map(r => `${r.role}`).join(", ")
    : "Not obvious from the text you provided";

  const callout = a.multiRole
    ? `<div class="notice"><strong>Major weakness:</strong> your resume is trying to target multiple roles at once. In real hiring pipelines this reads as uncertainty and lowers your callback rate.</div>`
    : "";

  const roleFix = a.targetRole
    ? `Your target role is listed as: <strong>${escapeHtml(a.targetRole)}</strong>. That needs to be reinforced in the first few lines and in your project + bullet language.`
    : `You did not specify a target role. You need to choose one primary direction so the resume reads as a match within seconds.`;

  const headerFixes = [
    a.flags.hasEmail ? null : "Add a professional email in the header.",
    a.flags.hasPhone ? null : "Add a phone number in the header.",
    a.flags.hasLinkedIn ? null : "Add your LinkedIn URL in the header. Hiring teams use it as a credibility check.",
  ].filter(Boolean);

  const sectionFixes = [
    !a.flags.hasEducation ? "Add a clear Education section with degree type and dates." : null,
    !a.flags.hasExperience ? "Add an Experience section with bullets that show decisions and results." : null,
    !a.flags.hasSkills ? "Add a Skills section grouped by category (Tools, Hardware, Software, Test, Manufacturing)." : null,
    !a.flags.hasProjects ? "Add a Projects section. For internship/entry-level, projects often decide interviews." : null,
  ].filter(Boolean);

  const impactGuidance = `
    <h3>Impact bullet rules (this is where resumes win or lose)</h3>
    <ul>
      <li>Duties are not enough. Your bullets must show decision-making and problem-solving.</li>
      <li>Use constraints + tools + result. If you can quantify anything, do it.</li>
      <li>Good pattern: <strong>Action</strong> + <strong>Tool</strong> + <strong>Why</strong> + <strong>Result</strong> + <strong>Metric</strong>.</li>
    </ul>

    <h4>Rewrite examples you can copy</h4>
    <ul>
      <li><strong>Experience:</strong> Improved test throughput by ___% by redesigning the ___ procedure using ___, reducing re-test time from ___ to ___.</li>
      <li><strong>Project:</strong> Designed and validated a ___ system under constraints (time: ___, budget: ___), selecting ___ over ___ to meet a target of ___.</li>
      <li><strong>Skills credibility:</strong> Tools: ___ (used to ___ on ___), ___ (used to diagnose ___ and reduce ___ by ___%).</li>
    </ul>
  `;

  const atsGuidance = `
    <h3>ATS and recruiter reality check</h3>
    <ul>
      <li>Use standard headers: Education, Experience, Projects, Skills.</li>
      <li>Avoid columns/graphics that break parsing. Keep formatting clean and consistent.</li>
      <li>Do not keyword-stuff. Match wording to real job postings lightly and honestly.</li>
    </ul>
  `;

  const nextSteps = `
    <h3>Prioritized next steps</h3>
    <ol>
      <li>Write a one-sentence positioning line at the top that states the target role and the kind of problems you can help solve.</li>
      <li>Rewrite your top 6 bullets into impact format (constraints, tools, result). Remove duty-only bullets.</li>
      <li>Strengthen Projects so each one states the problem, constraints, tools, your contribution, and decisions you made.</li>
      <li>Tighten Skills into categories and remove anything you cannot defend in an interview.</li>
      <li>Apply only after the top third reads as a match in under 10 seconds.</li>
    </ol>
  `;

  const closing = `
    <h3>Final recommendation</h3>
    <p><strong>Readiness:</strong> ${escapeHtml(a.readiness)}</p>
    <p><strong>Single biggest improvement opportunity:</strong> ${escapeHtml(a.biggestOpportunity)}</p>
    <p><strong>What to fix before your next application cycle:</strong> positioning + impact bullets + projects. Those three determine whether you get screened in or screened out.</p>

    <hr />
    <p>Thank you for sending this to me to review. These are just my opinions, not absolute rules. Take them with a grain of salt and only implement what you feel will work for you.</p>
    <p>If you got any value from this review, please leave me a review on any of my TikTok videos that shows up on your feed.</p>
    <p><strong>Thanks,<br />Your Friend and Mentor,<br />Davis Booth</strong></p>
  `;

  return `
    <div class="review">
      <h2>Resume Review</h2>

      <h3>Readiness + Biggest Issue</h3>
      <p><strong>Verdict:</strong> ${escapeHtml(a.readiness)}</p>
      <p><strong>Biggest issue:</strong> ${escapeHtml(a.biggestOpportunity)}</p>

      ${callout}

      <h3>Role clarity</h3>
      <p>${roleFix}</p>
      <p><strong>What your resume signals right now:</strong> ${escapeHtml(detected)}</p>

      <h3>Scorecard</h3>
      <div class="scoregrid">
        <div class="score"><div class="n">${a.overall}</div><div class="l">Overall</div></div>
        <div class="score"><div class="n">${a.score.roleClarity}</div><div class="l">Role clarity</div></div>
        <div class="score"><div class="n">${a.score.projects}</div><div class="l">Projects</div></div>
        <div class="score"><div class="n">${a.score.impactBullets}</div><div class="l">Impact bullets</div></div>
        <div class="score"><div class="n">${a.score.atsReadability}</div><div class="l">ATS readability</div></div>
      </div>

      <h3>Header and structure fixes</h3>
      ${headerFixes.length ? `<ul>${headerFixes.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p>No major header issues detected from the text.</p>`}
      ${sectionFixes.length ? `<ul>${sectionFixes.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}

      ${impactGuidance}
      ${atsGuidance}
      ${nextSteps}
      ${closing}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
