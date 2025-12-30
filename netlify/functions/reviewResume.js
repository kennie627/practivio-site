// netlify/functions/reviewResume.js
// Engineering Mentor — Resume Review (OpenAI-powered)
// IMPORTANT: Set OPENAI_API_KEY in Netlify environment variables.

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

    const html = await generateResumeReviewHtml({
      resumeText,
      targetRole,
    });

    return json(200, { html });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || "Server error" });
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function normalize(t) {
  return t
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

async function generateResumeReviewHtml({ resumeText, targetRole }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it in Netlify: Site configuration → Environment variables.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-nano"; // cheaper default

  // Fence the resume so the model treats it as input, not instructions.
  const userPayload = [
    `TARGET ROLE (optional): ${targetRole || "(not provided)"}`,
    "",
    "RESUME TEXT (paste / extracted):",
    "```",
    resumeText,
    "```",
  ].join("\n");

  const systemRules = `
You write strict, high-signal resume critiques for engineering students and early-career engineers.

Non-negotiable requirements:
- Write directly to the person in second person ("you").
- Clear, professional language. No buzzwords. No emojis. No hype. No motivational fluff.
- Do NOT reference AI, tools, algorithms, automation, or that this is generated.
- Do not sound scripted or templated. Vary sentence length naturally.
- Be honest. Never apologize for being direct.
- Do not ask open-ended questions unless they explicitly asked for deeper clarification.
- Do not invent details. Only use what is present in the resume text.
- Do not hallucinate metrics, projects, or outcomes. If missing, say it’s missing.

Resume reality check:
- The resume must read as a match in under 10 seconds.
- Role clarity and impact bullets determine callbacks.
- If the resume appears to target multiple roles, call it out as a major weakness.

Required output format:
- Return ONLY a single HTML fragment (no markdown).
- Use simple tags: <div>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <hr>.
- Must include:
  1) Readiness + Biggest issue (verdict + single biggest issue)
  2) Scorecard with 5 categories (0–100): Overall, Role clarity, Projects strength, Impact bullets, ATS readability
  3) Section-by-section critique: Header, Summary/Positioning, Education, Projects, Experience, Skills, Formatting/ATS
  4) Rewrite examples (3) the user can copy (impact bullet, project bullet, skills credibility)
  5) A 7-day improvement plan (Day 1–Day 7)
  6) Final recommendation with:
     - Readiness statement
     - Single biggest improvement opportunity (exactly one)
     - What to fix before applying
  7) Required closing text and exact sign-off:

Thank you for sending this to me to review. These are just my opinions, not absolute rules. Take them with a grain of salt and only implement what you feel will work for you.

If you got any value from this review, please leave me a review on any of my TikTok videos that shows up on your feed.

Thanks,
Your Friend and Mentor,
Davis Booth
`.trim();

  const prompt = `
Create a Resume Review that follows all requirements.

Additional constraints:
- If target role is missing, treat that as the likely single biggest issue unless another issue is clearly bigger.
- Be specific about what to change and where (top third, bullets, section order).
- Keep it readable on mobile: short paragraphs, tight bullets.

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
      temperature: 0.35,
      max_output_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}). ${errText || ""}`.trim());
  }

  const data = await response.json();
  const html = extractTextFromResponsesApi(data).trim();

  if (!html || html.length < 200) {
    throw new Error("Generated review was empty or too short. Try again with more resume content pasted.");
  }

  // Basic guard: if it returned plain text, wrap it.
  if (!html.includes("<div") && !html.includes("<h2") && !html.includes("<p")) {
    return `<div class="review"><h2>Resume Review</h2><p>${escapeHtml(html)}</p></div>`;
  }

  return html;
}

function extractTextFromResponsesApi(data) {
  // Preferred: data.output[*].content[*].text
  if (data && Array.isArray(data.output)) {
    let out = "";
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c && typeof c.text === "string") out += c.text;
        if (c && c.type === "output_text" && typeof c.text === "string") out += c.text;
      }
    }
    if (out.trim()) return out;
  }

  // Fallbacks
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.text === "string") return data.text;

  return "";
}
