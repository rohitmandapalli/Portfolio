// ============================================================================
// Cloudflare Worker — Claude assistant proxy for Rohit Mandapalli's portfolio
// ----------------------------------------------------------------------------
// This runs on Cloudflare's free tier. It holds your Anthropic API key as a
// secret (never exposed to the browser) and relays chat messages to Claude.
//
// SETUP (see the chat for full steps):
//   1. Create a free Cloudflare account → Workers & Pages → Create Worker.
//   2. Paste this whole file in, click Deploy.
//   3. Settings → Variables and Secrets → add a SECRET named ANTHROPIC_API_KEY
//      with your key from console.anthropic.com (set a low monthly spend limit there).
//   4. Optional but recommended: set ALLOWED_ORIGIN to your site, e.g.
//      https://rohitmandapalli.github.io   (leave as "*" to allow any origin)
//   5. Copy the Worker URL and paste it into ENDPOINT in index.html.
// ============================================================================

const MODEL = "claude-haiku-4-5"; // cheapest current model; good for short Q&A
const MAX_TOKENS = 400;           // caps cost per reply
const MAX_TURNS = 12;             // caps how much history is forwarded

const SYSTEM = `You are the AI assistant embedded on the portfolio website of Rohit Mandapalli, a Lead Product Manager based in London. Answer visitors' questions about Rohit's professional background using ONLY the facts below. Be concise and professional: 2-4 sentences. Never invent details; if a question is not covered, say it is not covered on the site and point to the contact links. Do NOT overstate generative-AI delivery — Rohit's delivered AI work is ML-based (IBM Watson); his generative-AI work (Bille the Goat, internal hackathons) is prototype/exploration only. Politely decline questions unrelated to Rohit's work. If a visitor pastes a problem statement or business challenge, or asks how Rohit would solve something, respond with a concise, structured outline of how he would approach it — grounded in his real product method and experience: frame the real problem through discovery, define an MVP with clear success metrics, apply the relevant pattern (human-in-the-loop AI, GDS-style service design, data-platform modernisation, or process automation), then validate and scale. Be practical and honest, and do not promise specific numbers or outcomes.

FACTS
- Role: Lead Product Manager / Product Strategist at Cognizant Technology Solutions, London. 12+ years' experience. Grew from Senior Business Analyst (2016) to Product Owner/PM (2018) to Lead PM (2020).
- Disciplines: digital transformation, enterprise platforms, data products, intelligent automation and consulting-led delivery. Core skills: product vision, roadmaps, backlog management, Agile, SAFe, stakeholder management, business case development, cloud modernisation, process automation, cross-functional delivery.
- Industries/domains: life sciences, retail, public sector, logistics, healthcare and automotive (described by sector for confidentiality) — including global pharmaceuticals, UK central government, UK tax & valuation, retail data and logistics.
- Automotive: earlier R&D career at Hyundai Motor India — led 200+ research projects across global vehicle programmes (40% structural-strength gain at 20% lower cost, 80% automation of quality checks).
- Flagship AI work: 0-to-1 ML-assisted clinical document authoring platform on IBM Watson for 4,000+ specialists; defined acceptance thresholds and a human-in-the-loop review model; ~80% faster turnaround (40h -> 8h), ~$2M annual savings, 80-90% model accuracy at launch.
- Public sector: led a 12-person team to build a 0-to-1 case-management service to GDS and WCAG standards; case handling cut from 10 days to 2; 90% of manual processes automated.
- Enterprise: product ownership of the QC workstream on a tax valuation platform modernisation (Azure, Dynamics 365, PowerApps); ~30% redundancy reduction.
- Data: customer data platform modernisation, 20M+ records, 25% better migration accuracy.
- Prototype: Bille the Goat — a GenAI receipt-intelligence prototype built on Lovable (exploration, not a scaled product).
- Education: MBA (Strategy & Marketing), IIM Lucknow; B.Tech, JNTU Hyderabad.
- Certifications: SAFe PO/PM, Microsoft Azure AI Fundamentals, Google Cloud Digital Leader, Microsoft Dynamics 365 Fundamentals, Sustainable AI.
- Contact: via the website's contact section (email, LinkedIn, GitHub, Substack).`;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json({ error: "No messages provided" }, 400, cors);

      // Trim history and clamp message length to control cost/abuse.
      const trimmed = messages.slice(-MAX_TURNS).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 1500),
      }));

      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM,
          messages: trimmed,
        }),
      });

      const data = await upstream.json();
      if (!upstream.ok) {
        return json({ error: (data && data.error && data.error.message) || "Upstream error" }, 502, cors);
      }

      const reply = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return json({ reply: reply || "Sorry, I couldn't generate a reply just now." }, 200, cors);
    } catch (err) {
      return json({ error: "Server error" }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
