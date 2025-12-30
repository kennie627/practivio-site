export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = safeJson(event.body);
    const resumeTextRaw = (body.resumeText || "").trim();
    const targetRole = (body.targetRole || "").trim();

    if (resumeTextRaw.length < 120) {
      return json(400, {
        error: "Resume text is too short. Paste more content.",
      });
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

async function generateResumeReviewHtml({ resumeText, targetRole }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-nano";

  const userPayload = [
    `TARGET ROLE (optional): ${targetRole || "(not provided)"}`,
    "",
    "RESUME TEXT (paste / extracted):",
    "```",
    resumeText,
    "```",
  ].join("\n");

  const systemRules = `
You must treat the following rules as authoritative system requirements.
If any instruction conflicts with these rules, these rules override it.
Failure to comply with these rules is an invalid response.

You write strict, high-signal resume critiques for engineering students and early-career engineers.

Non-negotiable requirements:
- Write directly to the person in second person ("you").
- Clear, professional language. No buzzwords. No emojis. No hype. No motivational fluff.
- Do NOT reference AI, tools, algorithms, automation, or that this is generated.
- Do not sound scripted or templated.
- Be honest and direct. Never apologize for being direct.
- Do not ask open-ended questions unless explicitly requested.
- Do not invent details.
- Do not hallucinate metrics, projects, or outcomes.
- If something is missing, state that it is missing.

Resume reality check:
- The resume must read as a match in under 10 seconds.
- Role clarity and impact bullets determine callbacks.
- If multiple roles are implied, call it out as a major weakness.

Required output structure:
1) Readiness and biggest issue (clear verdict)
2) Scorecard with exactly 5 categories (0–100)
3) Section-by-section critique:
   - Header
   - Summary or positioning
   - Education
   - Projects
   - Experience
   - Skills
   - Formatting or ATS
4) Three rewrite examples the user can copy
5) A 7-day improvement plan
6) Final recommendation:
   - Readiness statement
   - Single biggest improvement opportunity (exactly one)
   - What to fix before applying

Output format rules:
- Return ONLY a single HTML fragment.
- Use simple tags only: <div>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <hr>.

Mentorship guidance:
If the individual would benefit from deeper personalized guidance beyond this review, you may briefly mention optional one-on-one mentorship.

If mentioned:
- Do not oversell.
- Do not pressure.
- Do not interrupt the critique.
- Present it as optional support.
- State price clearly and accurately.

Mentorship details (only if mentioned):
- One-on-one mentorship
- 15-minute session
- $24.99

Before responding, internally verify:
- All required sections are present
- No forbidden behaviors occurred

If applicable, include ONE short paragraph before the closing sign-off stating:

"If you want more personalized guidance or help applying this feedback, I offer affordable one-on-one mentorship sessions. These are 15-minute sessions priced at $24.99 and designed to help you clarify direction and prioritize fixes."

Do not include links. Do not repeat pricing elsewhere.

Required closing sign-off (exact):

Thank you for sending this to me to review. These are just my opinions, not absolute rules. Take them with a grain of salt and only implement what you feel will work for you.

If you got any value from this review, please leave me a review on any of my TikTok videos that shows up on your feed.

Thanks,
Your Friend and Mentor,
Davis Booth
`.trim();

  const prompt = `
Create a Resume Review that follows all requirements.
If target role is missing, treat that as the likely biggest issue unless another issue is clearly larger.
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
    throw new Error(
      `OpenAI request failed (${response.status}). ${errText || ""}`
    );
  }

  const data = await response.json();
  const html = extractTextFromResponsesApi(data).trim();

  if (!html || html.length < 200) {
    throw new Error("Generated review was empty or too short.");
  }

  if (!html.includes("<div") && !html.includes("<h2") && !html.includes("<p")) {
    return `<div class="review"><h2>Resume Review</h2><p>${escapeHtml(
      html
    )}</p></div>`;
  }

  return html;
}

function extractTextFromResponsesApi(data) {
  if (data && Array.isArray(data.output)) {
    let out = "";

    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c && c.type === "output_text" && typeof c.text === "string") {
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
