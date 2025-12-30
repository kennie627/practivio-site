export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = safeJson(event.body);
    const linkedinText = (body.linkedinText || "").trim();
    const targetRole = (body.targetRole || "").trim();

    if (linkedinText.length < 80) {
      return json(400, { error: "LinkedIn text is too short. Paste headline/about/experience content." });
    }

    // Fallback review (works without paid AI)
    const html = renderBasicLinkedInReview(linkedinText, targetRole);

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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderBasicLinkedInReview(text, role) {
  const roleLine = role ? `<p><strong>Target role:</strong> ${escapeHtml(role)}</p>` : "";

  return `
    <h3>LinkedIn profile received</h3>
    ${roleLine}
    <h4>Fast fixes (high impact)</h4>
    <ol>
      <li><strong>Headline:</strong> Make it role + niche + proof. Example: “Test Engineer | Aerospace & Launch Systems | NASA/ULA | ATE + LabVIEW + EGSE”.</li>
      <li><strong>About section:</strong> 3 parts: what you do, proof, who you help.</li>
      <li><strong>Experience bullets:</strong> Add metrics (yield, throughput, downtime, defects, schedule).</li>
      <li><strong>Featured:</strong> Add 1 resume PDF, 1 project/story post, 1 “how I help students” post.</li>
      <li><strong>Skills:</strong> Group by categories and pin top 3.</li>
    </ol>

    <h4>What to paste next for a deeper review</h4>
    <ul>
      <li>Headline</li>
      <li>About</li>
      <li>2–3 job entries (top bullets)</li>
      <li>Featured links</li>
    </ul>

    <details style="margin-top:10px;">
      <summary><strong>Raw text received</strong> (for troubleshooting)</summary>
      <pre style="white-space:pre-wrap;">${escapeHtml(text.slice(0, 2000))}${text.length > 2000 ? "\n\n[truncated]" : ""}</pre>
    </details>
  `;
}
