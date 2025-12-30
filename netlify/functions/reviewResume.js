export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = safeJson(event.body);
    const resumeText = (body.resumeText || "").trim();

    if (resumeText.length < 80) {
      return json(400, { error: "Resume text is too short. Paste more content." });
    }

    // If you already have this working, keep your existing AI call.
    // This fallback just returns a structured response if no AI is configured.
    const html = renderBasicResumeReview(resumeText);

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
  try { return JSON.parse(raw || "{}"); }
  catch { return {}; }
}

// Basic fallback review (works without paid AI)
function renderBasicResumeReview(text) {
  return `
    <h3>Resume received</h3>
    <p><strong>Note:</strong> AI review is not configured on the server yet, so this is a basic structure check.</p>
    <h4>What I see</h4>
    <ul>
      <li>Length: ${text.length.toLocaleString()} characters</li>
      <li>Tip: Add impact bullets with metrics (time saved, yield improved, cost reduced).</li>
      <li>Tip: Move strongest experience/projects to the top.</li>
    </ul>
    <h4>Next steps</h4>
    <ol>
      <li>Add a clear target role line near the top.</li>
      <li>Rewrite 6 bullets into: action + tool + result + metric.</li>
      <li>Add 2–4 project-style bullets even for work you’ve done.</li>
    </ol>
  `;
}
