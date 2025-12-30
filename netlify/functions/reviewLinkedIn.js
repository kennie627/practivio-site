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

const ipHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxHits = 1;
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

function clarityVerdict(text, targetRole) {
  const t = text.toLowerCase();
  const tr = (targetRole || "").toLowerCase();
  const roleWords = ["engineer", "test", "manufacturing", "systems", "electrical", "mechanical", "software", "aerospace", "controls", "quality", "firmware"];
  const hits = roleWords.filter(w => t.includes(w)).length + (tr ? 2 : 0);
  if (hits >= 9) return "Clear in 5 seconds";
  if (hits >= 5) return "Somewhat clear, but still vague";
  return "Unclear — reads like a generic student profile";
}

function biggestIssue(text, targetRole) {
  const t = text.toLowerCase();
  if (!targetRole && !/test|manufacturing|systems|electrical|mechanical|software|aerospace/.test(t)) {
    return "Your profile does not clearly state what role you want or what problems you can help solve.";
  }
  if (/passionate|motivated|hardworking|team player/.test(t)) {
    return "Too much personality language and not enough engineering signal (projects, tools, outcomes).";
  }
  return "Your headline and About section are not doing enough to invite recruiter messages.";
}

function headlineOptions(targetRole) {
  const role = targetRole || "Engineering Student / Early-Career Engineer";
  return [
    `${role} | Projects in ______ | Tools: ______ | Interested in ______ problems`,
    `${role} | Building skills in ______ + ______ | Open to internship / entry-level roles`,
    `${role} | Hands-on projects: ______ | Strong in troubleshooting + process thinking`
  ];
}

function aboutRewrite(targetRole) {
  const role = targetRole || "engineering student / early-career engineer";
  return `I’m a ${role} focused on building real hiring signal: projects, tools, and measurable outcomes.

Right now I’m developing skills in:
- ______ (tool/technology)
- ______ (domain or method)
- ______ (systems or process)

I like work that involves troubleshooting, constraints, and getting from “doesn’t work” to “works reliably.” I’m targeting roles where I can contribute quickly, learn fast, and build depth in ______.`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "unknown";
  if (rateLimit(ip)) return json(429, { error: "Too many requests. Try again in 1 minute." });

  try {
    const body = JSON.parse(event.body || "{}");
    const text = normalize(body.text || "");
    const targetRole = normalize(body.targetRole || "");

    if (text.length < 200) return json(400, { error: "LinkedIn text is too short. Paste more of your profile content." });
    if (text.length > 25000) return json(400, { error: "LinkedIn text too long. Please paste a shorter version." });

    const positioning = clarityVerdict(text, targetRole);
    const biggest = biggestIssue(text, targetRole);

    const response = {
      positioningVerdict: positioning,
      biggestIssue: biggest,
      realityCheck:
        "LinkedIn is not a biography. Recruiters scan your headline + About to decide if you’re worth messaging. If it’s vague, they move on.",
      headlineOptions: headlineOptions(targetRole),
      aboutRewrite: aboutRewrite(targetRole),
      experienceFixes: [
        "Rewrite experience bullets as impact, not duties: action + tool + why + result.",
        "Add 2–3 bullets per role that show troubleshooting, constraints, and measurable outcomes.",
        "If you lack direct engineering experience, translate non-engineering work into signal: reliability, process, quality, ownership."
      ],
      projectFixes: [
        "Add 2–4 projects that match your target role. Each should include: goal, constraints, tools, decisions, results.",
        "If a project has no outcome metric, add one (performance, time saved, error reduced, yield improved).",
        "Link projects to a portfolio/GitHub only if it increases credibility (quality > quantity)."
      ],
      skillsCleanup: [
        "Remove vague traits (hardworking, passionate). Replace with tools and methods you can prove.",
        "Group skills by category (Hardware, Software, Test, Manufacturing, Tools).",
        "Only list skills that appear in your projects/experience. Consistency builds trust."
      ],
      networkPlan: [
        "Connect with 20 engineers in your target domain (not just students).",
        "Send 5 short messages asking about the role and what projects/tools matter most.",
        "Follow 10 target companies and comment thoughtfully on engineering posts 2x/week (not likes-only)."
      ],
      nextSteps: [
        "Update headline using one of the options above (make role + tools obvious).",
        "Paste the About rewrite and customize the blanks with your real tools and interests.",
        "Add 2 strong projects and rewrite 6 bullets across experience/projects using impact format.",
        "Run a final 5-second test: would a recruiter know what to message you about?"
      ]
    };

    return json(200, response);
  } catch (err) {
    return json(500, { error: "Server error generating review." });
  }
};
