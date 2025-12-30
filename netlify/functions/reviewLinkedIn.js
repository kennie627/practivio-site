// netlify/functions/reviewLinkedIn.js
// Engineering Mentor — LinkedIn Profile Review (OpenAI-powered)
// IMPORTANT: Set OPENAI_API_KEY in Netlify environment variables.

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = safeJson(event.body);
    const linkedinTextRaw = (body.linkedinText || "").trim();
    const targetRole = (body.targetRole || "").trim();

    if (linkedinTextRaw.length < 120) {
      return json(400, {
        error: "LinkedIn text is too short. Paste headline/about/experience content.",
      });
    }

    const linkedinText = normalize(linkedinTextRaw);

    const html = await generateLinkedInReviewHtml({
      linkedinText,
      targetRole,
    });

    return json(200, { html });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || "Server error" });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function normalize(t) {
  return String(t || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function generateLinkedInReviewHtml({ linkedinText, targetRole }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it in Netlify: Site configuration → Environment variables."
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-nano";

  const userPayload = [
    `TARGET ROLE (optional): ${targetRole || "(not provided)"}`,
    "",
    "LINKEDIN CONTENT (paste / exported text):",
    "```",
    linkedinText,
    "```",
  ].join("\n");

  const systemRules = `
You write LinkedIn profile critiques for engineering students and early-career engineers.

Non-negotiable requirements:
- Write directly to the person in second person ("you").
- Clear, professional language. No buzzwords. No emojis. No hype. No motivational fluff.
- Do NOT reference AI, tools, algorithms, automation, or that this is generated.
- Do not sound scripted or templated. Vary sentence length naturally.
- Be honest even if uncomfortable. Never apologize for being honest.
- Do not ask open-ended questions unless they explicitly requested deeper mentoring clarification.
- Do not give multiple branching options. Pick the best path and explain it.
- Do not restate their text verbatim. Summarize what matters.

Core LinkedIn reality check:
- Their profile exists to answer: "Is this person worth messaging, referring, or interviewing?"
- Positioning must be clear within five seconds.
- If the profile tries to appeal to multiple unrelated roles, call it out as a major weakness.
- Headline is the highest priority. Must communicate direction, not potential.

Required coverage:
- Positioning
- Headline
- About
- Experience
- Projects
- Skills
- Education
- Activity
- Network strategy
- Messaging readiness
- Gaps/weaknesses

Output format requirements:
- Return ONLY a single HTML fragment (no markdown).
- Use simple tags: <div>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <hr>.
- Include a compact scorecard with 5 categories (0–100):
  Overall, Positioning, Experience signal, Projects, Skills credibility.
- Include required ending elements:
  1) Prioritized next steps
  2) Single biggest improvement opportunity
  3) What to fix before applying
  4) Internship or entry-level readiness
  5) How this fits into job search strategy
  6) Required closing text and exact sign-off:

Thanks,
Your Friend and Mentor,
Davis Booth
`.trim();

  const prompt = `
Create a LinkedIn Profile Review that follows all requirements.
If target role is missing, diagnose that as the likely single biggest issue unless another issue is clearly bigger.

Make the review readable on a phone:
- short sections
- tight bullets
- direct language

Return only HTML.
`.trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemRules },
        { role: "user", content: prompt + "\n\n" + userPayload },
      ],
      temperature: 0.4,
      max_output_tokens: 1800,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed (${response.status}). ${errText || ""}`.trim()
    );
  }

  const data = await response.json();
  const html = extractTextFromResponsesApi(data).trim();

  if (!html || html.length < 200) {
    throw new Error(
      "Generated review was empty or too short. Try again with more LinkedIn content pasted."
    );
  }

  if (!html.includes("<div") && !html.includes("<h2") && !html.includes("<p")) {
    return `<div class="review"><h2>LinkedIn Profile Review</h2><p>${escapeHtml(
      html
    )}</p></div>`;
  }

  return html;
}

/**
 * FIXED extractor — prevents duplicate output
 */
function extractTextFromResponsesApi(data) {
  if (data && Array.isArray(data.output)) {
    let out = "";

    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;

      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          out += c.text;
        }
      }
    }

    if (out.trim()) return out;
  }

  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.text === "string") return data.text;

  return "";
}
