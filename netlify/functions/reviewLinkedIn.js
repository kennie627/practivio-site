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
    throw new Error("Missing OPENAI_API_KEY");
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
You must treat the following rules as authoritative system requirements.
If any instruction conflicts with these rules, these rules override it.
Failure to comply with these rules is an invalid response.

You write LinkedIn profile critiques for engineering students and early-career engineers.

Non-negotiable requirements:
- Write directly to the person in second person ("you").
- Clear, professional language. No buzzwords. No emojis. No hype. No motivational fluff.
- Do NOT reference AI, tools, algorithms, automation, or that this is generated.
- Do not sound scripted or templated.
- Be honest even if uncomfortable.
- Do not ask open-ended questions unless explicitly requested.
- Do not restate their text verbatim.

Core LinkedIn reality check:
- The profile must answer: "Is this person worth messaging, referring, or interviewing?"
- Positioning must be clear within five seconds.
- Multiple unrelated roles must be flagged as a weakness.

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
- Gaps or weaknesses

Output requirements:
- Return ONLY a single HTML fragment.
- Use simple tags only.
- Include a scorecard with 5 categories (0–100).

Mentorship guidance:
If the person would benefit from deeper guidance beyond this review, you may briefly mention optional mentorship.

Mentorship details (only if mentioned):
- One-on-one session
- 15 minutes
- $24.99

Before responding, internally verify:
- All required sections are present
- No forbidden behaviors occurred

If applicable, include ONE short paragraph before the closing sign-off stating:

"If you want more personalized guidance or help applying this feedback, I offer affordable one-on-one mentorship sessions. These are 15-minute sessions priced at $24.99 and designed to help you clarify direction and prioritize fixes."

Do not include links. Do not repeat pricing elsewhere.

Required closing sign-off (exact):

Thanks,
Your Friend and Mentor,
Davis Booth
`.trim();

  const prompt = `
Create a LinkedIn Profile Review that follows all requirements.
If target role is missing, treat that as the likely biggest issue unless another is clearly larger.
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
    throw new Error(`OpenAI request failed (${response.status}). ${errText || ""}`);
  }

  const data = await response.json();
  const html = extractTextFromResponsesApi(data).trim();

  if (!html || html.length < 200) {
    throw new Error("Generated review was empty or too short.");
  }

  if (!html.includes("<div") && !html.includes("<h2") && !html.includes("<p")) {
    return `<div class="review"><h2>LinkedIn Profile Review</h2><p>${escapeHtml(html)}</p></div>`;
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
