# JARVIS — sicherer KI-Sprachassistent (Vercel + GitHub)

Ein sprachgesteuerter KI-Assistent im Iron-Man-HUD-Stil. Läuft im Browser,
gehostet über **Vercel**, verbunden mit **GitHub**. Die API-Keys liegen
**sicher auf dem Server** — niemals im Code, niemals im Browser.

---

## 🔒 Wie die Sicherheit funktioniert

1. **Keys nur als Server-Geheimnisse:** Deine OpenAI- und ElevenLabs-Keys
   speicherst du als *Environment Variables* bei Vercel. Sie stehen nie im
   Code und kommen nie auf GitHub (`.gitignore` schützt `.env`).
2. **Der Browser sieht die Keys nie:** Die Webseite ruft nur **deine eigenen**
   Funktionen `/api/chat`, `/api/tts`, `/api/stt`. Diese fügen den Key
   serverseitig hinzu und sprechen mit OpenAI/ElevenLabs.
3. **Persönliches Passwort:** Jede Funktion ist mit deinem `APP_PASSWORD`
   geschützt. Die Seite ist zwar im Internet, aber nur **du** kannst JARVIS
   benutzen — niemand sonst kann deine Rechnung belasten.
4. **Backstop:** Setz im OpenAI-Dashboard ein **Ausgabenlimit**.

---

## 🚀 Einrichten (einmalig, ~10 Minuten)

### Schritt 1 — Keys besorgen
- **OpenAI:** platform.openai.com → *API keys* → *Create new secret key* (`sk-...`)
- **ElevenLabs:** elevenlabs.io → Profil → *API Key*
- **Voice-ID:** elevenlabs.io → *Voices* → bei einer Stimme die ID kopieren
  (Standard ist schon `MMwckqU477oQxnAk1SgA`)

### Schritt 2 — Code auf GitHub
Der Code liegt in deinem Repo `Jarvis_assistant10`. Wenn Dateien fehlen:
GitHub → **Add file → Upload files** → Dateien reinziehen → **Commit**.

### Schritt 3 — Vercel verbinden
1. **vercel.com** → mit **GitHub** anmelden
2. **Add New… → Project** → Repo `Jarvis_assistant10` → **Import**
3. Framework: **Other** (nichts ändern)
4. **NOCH NICHT auf Deploy klicken!** Erst die Keys eintragen ⬇️

### Schritt 4 — Geheime Keys bei Vercel eintragen 🔑
Im Import-Bildschirm (oder später unter **Settings → Environment Variables**)
trag diese **4 Variablen** ein:

| Name | Wert |
|------|------|
| `OPENAI_API_KEY` | dein OpenAI-Key |
| `ELEVENLABS_API_KEY` | dein ElevenLabs-Key |
| `ELEVENLABS_VOICE_ID` | `MMwckqU477oQxnAk1SgA` |
| `APP_PASSWORD` | ein Passwort, das du dir ausdenkst |

Dann **Deploy** klicken.

### Schritt 5 — Benutzen
1. Öffne deine `…vercel.app`-Adresse in **Chrome**
2. Gib dein `APP_PASSWORD` ein
3. 🎤 Mikro-Knopf (oder Leertaste) halten und sprechen — oder Text tippen
4. JARVIS antwortet mit Stimme ✨

> Test: `…vercel.app/api/health` zeigt, ob alle 4 Variablen gesetzt sind
> (nur ja/nein, keine Keys werden angezeigt).

---

## 📁 Aufbau
```
index.html        HUD + Login
style.css         Aussehen
js/
  voice-viz.js    leuchtender Kreis
  app.js          Login, Sprach-Loop (ruft /api)
api/              SICHERE Server-Funktionen (Keys bleiben hier)
  _lib.js         Passwort-Prüfung
  chat.js         Gehirn  (OpenAI)
  tts.js          Stimme raus (ElevenLabs)
  stt.js          Stimme rein (Whisper)
  health.js       Test
```

## Nächste Schritte
- [x] Sicheres Hosting, Text + Sprache
- [ ] Obsidian-Notizen (Browser-Ordnerzugriff)
- [ ] Wake-Word „Jarvis"
