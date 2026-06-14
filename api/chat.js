// ============================================================
// /api/chat — Das Gehirn.
// Bekommt die Gesprächsnachrichten, fragt OpenAI (GPT-4o-mini)
// und gibt die Antwort zurück. Der OpenAI-Key bleibt auf dem Server.
// ============================================================
import { checkAuth } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!checkAuth(req, res)) return; // Passwort prüfen

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "OPENAI_API_KEY fehlt auf dem Server." });

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Es fehlen 'messages'." });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        messages,
        max_tokens: 400,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "OpenAI-Fehler: " + t });
    }

    const d = await r.json();
    res.status(200).json({ reply: d.choices[0].message.content.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
