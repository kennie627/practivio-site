function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

// Very simple in-memory rate limit (best-effort on serverless)
const ipHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxHits = 1; // 1 per minute per IP
  const rec = ipHits.get(ip) || { count: 0, start: now };

  if (now - rec.start > windowMs) {
    ipHits.set(ip, { count: 1, start: now });
    return false;
  }
  rec.count += 1;
  ipHits.set(ip, rec);
  return rec.count > maxHits;
}

function normalize(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function detectSections(text) {
  const t = text.toLowerCase();
  const hasEducation = /education|university|college|b\.s\.|bachelor|master|gpa/.test(t);
  const hasProjects = /projects|capstone|design project|built|designed|prototype/.test(t);
  const hasExperience = /experience|intern|employment|worked at|responsible for/.test(t);
  const hasSkills = /skills|proficient|familiar|tools|technologies/.test(t);
  return { hasEducation, hasProjects, hasExperience, hasSkills };
}

function countMetrics(text) {
  const m = text.match(/\b(\d+%|\$?\d{1,3}(,\d{3})+|\b\d+\b\s*(hours|days|weeks|months|years)|\b\d+\b\s*(units|tests|boards|systems|lines|users|customers|devices))\b/gi);
  return m ? m.length : 0;
}

function countWeakWords(text) {
  const weak = ["responsible for", "worked on", "helped", "assisted", "participated", "team player", "hardworking", "motivated", "passionate"];
  const t = text.toLowerCase();
  let c = 0;
  weak.forEach(w => { if (t.includes(w)) c += 1; });
  return c;
}

function guessRoleClarity(text, targetRole) {
  const t = text.toLowerCase();
  const tr = (targetRole || "").toLowerCase();
  const roleHints = ["engineer", "engineering", "test", "manufacturing", "systems", "electrical", "mechanical", "software", "aerospace", "firmware", "controls", "quality"];
  const hits = roleHints.filter(k => t.includes(k)).length + (tr ? 2 : 0);
  if (hits >= 10) return 85;
  if (hits >= 6) return 70;
  if (hits >= 3) return 55;
  return 40;
}

function scoreResume(text, targetRole) {
  const sections = detectSections(text);
  const metrics = countMetrics(text);
  const weakWords = countWeakWords(text);
  const length = text.length;

  const roleClarity = guessRoleClarity(text, targetRole);

  const projects = sections.hasProjects ? (metrics >= 3 ? 75 : 60) : 35;
  const impactBullets = metrics >= 8 ? 80 : metrics >= 4 ? 65 : 45;
  const skillsCredibility = sections.hasSkills ? (weakWords >= 2 ? 55 : 70) : 40;
  const atsReadability = length >= 1200 && length <= 12000 ? 75 : 55;
  const formatting = 70; // we can’t truly see formatting; assume neutral

  const overall = Math.round(
    (roleClarity * 0.22) +
    (projects * 0.18) +
    (impactBullets * 0.22) +
    (skillsCredibility * 0.18) +
    (atsReadability * 0.12) +
    (formatting * 0.08)
  );

  return { overall, roleClarity, projects, impactBullets, skillsCredibility, atsReadability, formatting, metrics, weakWords, sections };
}

function verdictFromScore(overall) {
  if (overall >= 80) return "Internship/Entry-level ready (with minor tightening)";
  if (overall >= 65) return "Close, but not yet hiring-manager ready";
  return "Not yet — needs restructuring for hiring signal";
}

function biggestIssue(score) {
  // choose the lowest-impact bucket as the single biggest issue
  const buckets = [
    ["Role clarity (what job you’re targeting)", score.roleClarity],
    ["Projects (signal of engineering thinking)", score.projects],
    ["Impact bullets (results, constraints, metrics)", score.impactBullets],
    ["Skills credibility (skills must match evidence)", score.skillsCredibility],
    ["ATS readability (structure recruiters can scan)", score.atsReadability],
  ];
  buckets.sort((a, b) => a[1] - b[1]);
  return buckets[0][0];
}

function buildSectionCritique(text, score, targetRole) {
  const t = text.toLowerCase();
  const findingsHeader = [];
  const findingsSummary = [];
  const findingsEducation = [];
  const findingsProjects = [];
  const findingsExperience = [];
  const findingsSkills = [];
  const findingsATS = [];

  // Header / contact
  if (!/email|@/.test(t)) findingsHeader.push("Your header should include a professional email address. If it’s missing, add it.");
  if (!/linkedin\.com\/in\//.test(t)) findingsHeader.push("Add your LinkedIn URL in the header. Hiring managers use it as a credibility check.");
  findingsHeader.push("Make sure the first line clearly shows your name and your target engineering direction.");

  // Summary
  if (/objective|seeking|passionate|motivated/.test(t)) {
    findingsSummary.push("If your summary reads like an objective statement, replace it with a 2–3 line positioning statement or remove it.");
  }
  findingsSummary.push("Your opening needs to answer: what type of engineer are you becoming, and what problems can you help solve?");
  if (targetRole) findingsSummary.push(`Align the first lines to the target role: ${targetRole}.`);

  // Education
  if (!/education|university|college|bachelor|master/.test(t)) {
    findingsEducation.push("If you have a degree, add a clear Education section with school, degree, and graduation date.");
  } else {
    if (/gpa/.test(t)) findingsEducation.push("Only include GPA if it helps (generally 3.3+). Otherwise remove it and lead with projects.");
    findingsEducation.push("Coursework should only appear if it directly supports the target role and matches job postings.");
  }

  // Projects
  if (!score.sections.hasProjects) {
    findingsProjects.push("You need a Projects section. For entry-level roles, projects are your proof of engineering thinking.");
    findingsProjects.push("Add 2–4 projects with: goal, constraints, tools, decisions, results.");
  } else {
    if (score.metrics < 3) findingsProjects.push("Your projects need outcomes. Add measurable results (time saved, error reduction, performance, throughput, yield).");
    findingsProjects.push("Translate academic language into industry signal: what problem did you solve, what did you change, what improved?");
  }

  // Experience
  if (!score.sections.hasExperience) {
    findingsExperience.push("Add an Experience section even if it’s not engineering. Show responsibility, reliability, troubleshooting, process thinking.");
  } else {
    if (score.weakWords >= 2) findingsExperience.push("Too many duty-style bullets. Convert bullets to impact: action + tool + why + result.");
    if (score.metrics < 4) findingsExperience.push("Add numbers where possible: volume, cycle time, defects, throughput, schedule, cost, tests completed.");
    findingsExperience.push("Your best bullets should show decisions, constraints, and results — not tasks.");
  }

  // Skills
  if (!score.sections.hasSkills) {
    findingsSkills.push("Add a Skills section. Keep it tight and believable: only list what you can defend in an interview.");
  } else {
    findingsSkills.push("Group skills by category (Tools, Hardware, Software, Test, Manufacturing, etc.).");
    findingsSkills.push("Remove buzzword stacking. Skills must be supported by projects/experience evidence.");
  }

  // Formatting / ATS
  findingsATS.push("Use standard section headers: Education, Experience, Projects, Skills.");
  findingsATS.push("Avoid graphics, columns, or icons that break ATS parsing.");
  findingsATS.push("Resume should be readable in 30 seconds. Lead with strongest signal: projects/experience tied to target role.");

  return [
    { title: "Header", summary: "Trust and contact clarity. Hiring managers must know who you are and how to reach you immediately.", findings: findingsHeader },
    { title: "Summary / Positioning", summary: "Either position you clearly, or it hurts you by sounding vague.", findings: findingsSummary },
    { title: "Education", summary: "Education supports the story, but projects and impact usually do the selling.", findings: findingsEducation },
    { title: "Projects", summary: "For entry-level, projects are often the deciding factor. Make them read like real engineering work.", findings: findingsProjects },
    { title: "Experience", summary: "Bullets must show impact, constraints, and results — not duties.", findings: findingsExperience },
    { title: "Skills", summary: "Only list what you can prove. Skills must match your projects and experience.", findings: findingsSkills },
    { title: "Formatting + ATS Reality", summary: "ATS and humans must both understand your resume quickly.", findings: findingsATS },
  ];
}

function buildRewriteExamples(score, targetRole) {
  const role = targetRole || "your target engineering role";
  return [
    {
      label: "Experience bullet (impact-first)",
      text: `Improved test throughput by X% by redesigning the ${role} test procedure (tool: ______), reducing re-test time from ___ to ___.`
    },
    {
      label: "Project bullet (constraints + decisions)",
      text: `Designed and validated a ______ system under constraints (budget: ___, time: ___), selecting ______ over ______ to meet performance target of ___.`
    },
    {
      label: "Skills credibility line (evidence-based)",
      text: `Tools: ______ (used in ______ project to ______), ______ (used to diagnose ______ and reduce ______ by ___%).`
    }
  ];
}

function build7DayPlan(score) {
  const plan = [];
  plan.push("Day 1: Write a one-sentence target role statement (what role, what domain, what you can do). Put it at the top as positioning.");
  plan.push("Day 2: Rewrite your top 6 bullets using impact format: action + tool + why + result. Remove duty-only bullets.");
  plan.push("Day 3: Add or strengthen 2–4 projects. Each must include constraints, tools, decisions, and outcomes.");
  plan.push("Day 4: Tighten Skills into categories. Remove anything you can’t defend in an interview.");
  plan.push("Day 5: Run an ATS sanity check: standard headers, no columns/graphics, consistent dates.");
  plan.push("Day 6: Tailor keywords lightly to 3 real job postings (no stuffing). Ensure projects match the role.");
  plan.push("Day 7: Apply to 10 roles with the updated resume and track results (callbacks, screens, rejections). Iterate from feedback.");
  return plan;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "unknown";
  if (rateLimit(ip)) return json(429, { error: "Too many requests. Try again in 1 minute." });

  try {
    const body = JSON.parse(event.body || "{}");
    const text = normalize(body.text || "");
    const targetRole = normalize(body.targetRole || "");

    if (text.length < 300) return json(400, { error: "Resume text is too short. Paste more content or extract from PDF." });
    if (text.length > 25000) return json(400, { error: "Resume text too long. Please paste a shorter version." });

    const score = scoreResume(text, targetRole);
    const verdict = verdictFromScore(score.overall);
    const biggest = biggestIssue(score);

    const response = {
      verdict,
      biggestIssue: biggest,
      realityCheck:
        "Hiring managers scan for role clarity, proof of engineering thinking (projects), and impact bullets. If your resume reads like duties and coursework, it won’t convert to interviews.",
      scoreOverall: score.overall,
      scoreBreakdown: {
        roleClarity: score.roleClarity,
        projects: score.projects,
        impactBullets: score.impactBullets,
        skillsCredibility: score.skillsCredibility,
        atsReadability: score.atsReadability,
        formatting: score.formatting
      },
      sectionCritique: buildSectionCritique(text, score, targetRole),
      rewriteExamples: buildRewriteExamples(score, targetRole),
      next7DaysPlan: build7DayPlan(score)
    };

    return json(200, response);
  } catch (err) {
    return json(500, { error: "Server error generating review." });
  }
};
