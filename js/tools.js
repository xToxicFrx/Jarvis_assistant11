// ============================================================
// TOOLS — die "Werkzeuge", die JARVIS benutzen darf.
//
// Zwei Teile:
//  1) TOOL_SCHEMAS  → Beschreibung für das KI-Modell (was kann was?)
//  2) runTool(...)  → führt das Werkzeug im Browser wirklich aus
//
// "ctx" ist ein Helfer-Objekt aus app.js mit Standort, Websuche,
// Timer-Funktion usw.
// ============================================================

// ---------- Wetter-Codes (Open-Meteo) in Text ----------
const WMO = {
  0: "klar", 1: "meist klar", 2: "teilweise bewölkt", 3: "bedeckt",
  45: "Nebel", 48: "Reifnebel", 51: "leichter Nieselregen", 53: "Nieselregen",
  61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  71: "leichter Schnee", 73: "Schnee", 75: "starker Schnee",
  80: "Regenschauer", 81: "Schauer", 82: "heftige Schauer", 95: "Gewitter",
};

// ============================================================
// 1) SCHEMAS — Beschreibung für das KI-Modell
// ============================================================
const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Gibt das aktuelle Datum und die genaue Uhrzeit zurück.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Aktuelles Wetter und Vorhersage für die nächsten Tage am Standort des Nutzers.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Wie viele Tage Vorhersage (1-5). Standard 3." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Sucht aktuelle Informationen im Internet (z.B. Fakten, Personen, Ereignisse).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Die Suchanfrage." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Durchsucht die Obsidian-Notizen (das zweite Gehirn) des Nutzers nach einem Stichwort.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Wonach gesucht werden soll." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_to_daily_note",
      description: "Hängt einen Eintrag (mit Uhrzeit) an die heutige Daily Note im Obsidian-Vault an.",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Der zu speichernde Text." } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Legt eine neue Notiz (Markdown-Datei) im Obsidian-Vault an.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titel/Dateiname der Notiz." },
          content: { type: "string", description: "Inhalt der Notiz." },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "Stellt einen Timer/eine Erinnerung. JARVIS sagt dann Bescheid.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "integer", description: "Dauer in Sekunden." },
          label: { type: "string", description: "Wofür die Erinnerung ist." },
        },
        required: ["seconds"],
      },
    },
  },
];

// ============================================================
// 2) AUSFÜHRUNG — was jedes Werkzeug wirklich tut
// ============================================================
async function runTool(name, args, ctx) {
  switch (name) {

    case "get_time": {
      const d = new Date();
      return d.toLocaleString("de-DE", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }

    case "get_weather": {
      const { lat, lon } = ctx.location();
      const days = Math.min(Math.max(args.days || 3, 1), 5);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`
        + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum`
        + `&timezone=auto&forecast_days=${days}`;
      const d = await (await fetch(url)).json();
      const c = d.current;
      let out = `Jetzt: ${Math.round(c.temperature_2m)}°C, ${WMO[c.weather_code] || "?"}, `
        + `Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m}%. `;
      for (let i = 0; i < d.daily.time.length; i++) {
        out += `${d.daily.time[i]}: ${Math.round(d.daily.temperature_2m_min[i])}–${Math.round(d.daily.temperature_2m_max[i])}°C, `
          + `${WMO[d.daily.weather_code[i]] || "?"}, Niederschlag ${d.daily.precipitation_sum[i]} mm. `;
      }
      return out;
    }

    case "web_search": {
      const d = await ctx.webSearch(args.query);
      return d.result + (d.source ? ` (Quelle: ${d.source})` : "");
    }

    case "search_notes": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const hits = await Obsidian.search(args.query, 5);
      if (!hits.length) return `Keine Notizen gefunden zu "${args.query}".`;
      return hits.map(h => `📄 ${h.name}: ${h.snippet}`).join("\n");
    }

    case "save_to_daily_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const file = await Obsidian.appendToDaily(args.text);
      return `Gespeichert in ${file}.`;
    }

    case "create_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const file = await Obsidian.createNote(args.title, args.content);
      return `Notiz "${file}" angelegt.`;
    }

    case "set_timer": {
      const secs = Math.max(1, parseInt(args.seconds) || 0);
      ctx.scheduleTimer(secs, args.label || "");
      const mins = Math.round(secs / 60);
      return `Timer gestellt für ${secs < 90 ? secs + " Sekunden" : mins + " Minuten"}${args.label ? " (" + args.label + ")" : ""}.`;
    }

    default:
      return "Unbekanntes Werkzeug: " + name;
  }
}
