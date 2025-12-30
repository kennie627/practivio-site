export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const body = safeJson(event.body);
    const linkedinTextRaw = (body.linkedinText || "").trim();
    const targetRole = (body.targetRole || "").trim();

    if (linkedinTextRaw.length < 120) {
      return json(400, { error: "LinkedIn text is too short. Paste headline/about/experience content." });
    }

    const linkedinText = normalize(linkedinTextRaw);
    const analysis = analyzeLinkedIn(linkedinText, targetRole);
    const html = renderLinkedInReview(analysis);

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
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function analyzeLinkedIn(text, targetRole) {
  const lower = text.toLowerCase();

  const hasHeadlineSignal = /engineer|engineering|test|systems|electrical|mechanical|manufacturing|software/i.test(text);
  const hasAbout = hasAny(text, ["about", "summary"]);
  const hasExperience = hasAny(text, ["experience", "employment", "work"]);
  const hasProjects = hasAny(text, ["projects", "project"]);
  const hasSkills = hasAny(text, ["skills", "endorsements"]);
  const hasEducation = hasAny(text, ["education", "university", "college", "bachelor", "master"]);
  const hasCerts = hasAny(text, ["certification", "certified", "cert", "ipc", "six sigma"]);

  const hasMetrics = /(\b\d{1,3}%\b|\b\d{3,}\b|\b\$?\d+(,\d{3})*\b)/.test(text);
  const vagueTraits = /(passionate|hard[- ]working|motivated|driven|eager|aspiring)/i.test(text);

  const roleSignals = [
    { name: "Electrical", keys: ["electrical", "pcb", "pcba", "schematic", "power electronics", "harness"] },
    { name: "Mechanical", keys: ["mechanical", "solidworks", "cad", "fea", "gd&t"] },
    { name: "Systems", keys: ["systems", "requirements", "integration", "verification", "validation", "v&v"] },
    { name: "Test", keys: ["test", "ate", "labview", "functional test", "ict", "debug"] },
    { name: "Manufacturing", keys: ["manufacturing", "smt", "yield", "lean", "process", "quality"] },
    { name: "Software", keys: ["software", "python", "c++", "javascript", "git"] }
  ];

  const detectedRoles = roleSignals
    .map(r => ({ role: r.name, hits: r.keys.filter(k => lower.includes(k)).length }))
    .filter(r => r.hits > 0)
    .sort((a,b) => b.hits - a.hits);

  const positioningClear =
    !!targetRole ||
    (detectedRoles.length > 0 && detectedRoles[0].hits >= 2);

  const biggestOpportunity = !positioningClear
    ? "Your positioning is not clear within five seconds. A recruiter cannot tell what role you are targeting."
    : !hasMetrics
      ? "Your experience reads like responsibilities. You need proof of decision-making, constraints, and results."
      : !hasProjects
        ? "You need a Projects section that proves engineering thinking and tools, especially if you are early-career."
        : "Tighten your headline and About so your direction is obvious and outreach is easy.";

  const score = {
    positioning: clamp(30 + (positioningClear ? 35 : 0) + (hasHeadlineSignal ? 15 : 0) - (vagueTraits ? 10 : 0), 0, 100),
    experienceSignal: clamp(25 + (hasExperience ? 25 : 0) + (hasMetrics ? 25 : 0), 0, 100),
    projects: clamp(25 + (hasProjects ? 40 : 0), 0, 100),
    skillsCredibility: clamp(35 + (hasSkills ? 35 : 0) - (vagueTraits ? 5 : 0), 0, 100),
    completeness: clamp(20 + (hasEducation ? 20 : 0) + (hasAbout ? 15 : 0) + (hasCerts ? 10 : 0) + (hasExperience ? 20 : 0), 0, 100)
  };

  const overall = Math.round((score.positioning + score.experienceSignal + score.projects + score.skillsCredibility + score.completeness) / 5);

  const readiness =
    overall >= 80 ? "This is close to entry-level job ready for most pipelines. Still tailor headline + top bullets per role."
    : overall >= 65 ? "Not job-ready yet. You are close, but your profile is not reducing risk for a recruiter."
    : "Not ready yet. You likely get viewed, but you are not converting to messages or interviews.";

  return {
    targetRole,
    detectedRoles,
    flags: { hasAbout, hasExperience, hasProjects, hasSkills, hasEducation, hasCerts, hasMetrics, vagueTraits, hasHeadlineSignal },
    positioningClear,
    score,
    overall,
    biggestOpportunity,
    readiness
  };
}

function renderLinkedInReview(a) {
  const detected = a.detectedRoles.length
    ? a.detectedRoles.slice(0, 3).map(r => `${r.role}`).join(", ")
    : "Not obvious from what you provided";

  const positioningFix = a.positioningClear
    ? `Your direction is somewhat clear, but it still needs to be explicit so a recruiter doesn’t have to interpret it.`
    : `Right now your profile does not answer the hiring question fast enough: “Is this person worth messaging or referring?”`;

  const headlineGuidance = `
    <h3>Headline (highest priority)</h3>
    <ul>
      <li>Your headline must communicate direction, not potential.</li>
      <li>A headline that only says “Engineering Student” or “Aspiring Engineer” is not enough.</li>
      <li>Use role language that matches real postings. Avoid vague traits.</li>
    </ul>
    <p><strong>Simple headline pattern:</strong> Target role + domain + proof tool(s). Example: “Test Engineer | ATE + LabVIEW | Aerospace systems”.</p>
  `;

  const aboutGuidance = `
    <h3>About section</h3>
    <ul>
      <li>Explain what you are working toward and how you think.</li>
      <li>State what problems interest you and what skills you are building.</li>
      <li>Remove cover-letter language and personal branding fluff.</li>
    </ul>
  `;

  const experienceGuidance = `
    <h3>Experience section</h3>
    <ul>
      <li>Duties alone are not acceptable. You need decisions, constraints, and results.</li>
      <li>Use impact bullets with tools and outcomes. Quantify when possible.</li>
      <li>Non-engineering roles must be reframed to show responsibility, reliability, and process thinking.</li>
    </ul>
  `;

  const projectsGuidance = `
    <h3>Projects (LinkedIn-specific)</h3>
    <ul>
      <li>Projects are critical for students and early-career engineers.</li>
      <li>Each project must state: problem, constraints, tools, your contribution, and decisions you made.</li>
      <li>Fewer strong projects beats many shallow ones.</li>
    </ul>
  `;

  const skillsGuidance = `
    <h3>Skills</h3>
    <ul>
      <li>Skills must match your projects and experience. Buzzword stacking hurts credibility.</li>
      <li>Group skills in categories that make sense to an engineering manager.</li>
      <li>Only list what you can defend in an interview.</li>
    </ul>
  `;

  const networkGuidance = `
    <h3>Network and messaging readiness</h3>
    <ul>
      <li>Your profile should make it easy to know what to message you about.</li>
      <li>Ambiguity creates hesitation. Your positioning should invite relevant conversations.</li>
      <li>Connections should include engineers and hiring-relevant roles, not just students.</li>
    </ul>
  `;

  const activityGuidance = `
    <h3>Activity</h3>
    <ul>
      <li>You do not need to post daily.</li>
      <li>If you are actively job searching, complete inactivity should be addressed.</li>
      <li>Thoughtful comments on technical posts help more than random likes.</li>
    </ul>
  `;

  const missing = [
    a.flags.hasAbout ? null : "Add or rewrite your About section so it explains your direction and how you think.",
    a.flags.hasExperience ? null : "Your Experience section needs stronger bullets that show decisions and results.",
    a.flags.hasProjects ? null : "Add a Projects section with 2–4 strong projects that support your target role.",
    a.flags.hasSkills ? null : "Clean up your Skills section so it matches your experience and projects.",
    a.flags.hasEducation ? null : "Ensure Education is clear and accurate with the correct degree type and dates."
  ].filter(Boolean);

  const closing = `
    <h3>Final recommendation</h3>
    <p><strong>Readiness:</strong> ${escapeHtml(a.readiness)}</p>
    <p><strong>Single biggest improvement opportunity:</strong> ${escapeHtml(a.biggestOpportunity)}</p>
    <p><strong>What to fix before applying or networking hard:</strong> make the headline + About read like a clear match, then rebuild experience/project bullets to show decisions, constraints, and results.</p>

    <hr />
    <p>Thank you for sending your profile to me. These are my opinions, not absolute rules. Implement only what feels right for you.</p>
    <p>If you found value, please leave me a review on any of my TikTok videos that appears on your feed.</p>
    <p><strong>Thanks,<br />Your Friend and Mentor,<br />Davis Booth</strong></p>
  `;

  return `
    <div class="review">
      <h2>LinkedIn Profile Review</h2>

      <h3>Recruiter and hiring manager reality check</h3>
      <p>Your profile exists to answer one question: “Is this person worth messaging, referring, or interviewing?”</p>
      <p><strong>What your profile signals right now:</strong> ${escapeHtml(detected)}</p>
      <p>${positioningFix}</p>

      <h3>Scorecard</h3>
      <div class="scoregrid">
        <div class="score"><div class="n">${a.overall}</div><div class="l">Overall</div></div>
        <div class="score"><div class="n">${a.score.positioning}</div><div class="l">Positioning</div></div>
        <div class="score"><div class="n">${a.score.experienceSignal}</div><div class="l">Experience signal</div></div>
        <div class="score"><div class="n">${a.score.projects}</div><div class="l">Projects</div></div>
        <div class="score"><div class="n">${a.score.skillsCredibility}</div><div class="l">Skills credibility</div></div>
      </div>

      ${a.flags.vagueTraits ? `<div class="notice"><strong>Callout:</strong> vague traits (motivated, passionate, aspiring) reduce clarity. Replace them with role language, tools, and proof.</div>` : ""}

      ${missing.length ? `<h3>Missing or weak sections</h3><ul>${missing.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}

      ${headlineGuidance}
      ${aboutGuidance}
      ${experienceGuidance}
      ${projectsGuidance}
      ${skillsGuidance}
      ${networkGuidance}
      ${activityGuidance}
      ${closing}
    </div>
  `;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
