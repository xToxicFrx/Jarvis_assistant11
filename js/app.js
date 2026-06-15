// ============================================================
// JARVIS — Browser-Logik (sichere Version mit Function-Calling)
//
// Ablauf:  Stimme/Text  →  Gehirn (kann Werkzeuge nutzen)  →  Stimme
// Die API-Keys liegen sicher auf dem Server (Vercel), nie im Browser.
// ============================================================

const $ = (id) => document.getElementById(id);
let appPassword = sessionStorage.getItem("jarvis_pw") || "";

// ============================================================
// API-AUFRUF (immer mit Passwort im Header)
// ============================================================
async function api(path, body, wantAudio = false) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-password": appPassword },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    sessionStorage.removeItem("jarvis_pw");
    showLogin("Passwort abgelehnt. Bitte erneut eingeben.");
    throw new Error("Nicht autorisiert");
  }
  if (!res.ok) {
    let msg = "Fehler " + res.status;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return wantAudio ? res.blob() : res.json();
}

// ============================================================
// LOGIN
// ============================================================
function showLogin(msg) {
  $("hud").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginErr").textContent = msg || "";
  $("pw").value = "";
  $("pw").focus();
}

async function tryLogin() {
  const pw = $("pw").value.trim();
  if (!pw) return;
  appPassword = pw;
  $("loginErr").textContent = "Prüfe…";
  try {
    await api("/api/chat", { messages: [{ role: "user", content: "ping" }] });
    sessionStorage.setItem("jarvis_pw", pw);
    $("login").classList.add("hidden");
    $("hud").classList.remove("hidden");
    startJarvis();
  } catch (e) {
    if (e.message !== "Nicht autorisiert") $("loginErr").textContent = "Fehler: " + e.message;
  }
}

$("loginBtn").addEventListener("click", tryLogin);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

if (appPassword) {
  $("login").classList.add("hidden");
  $("hud").classList.remove("hidden");
  startJarvis();
}

// ============================================================
// HAUPT-APP
// ============================================================
let started = false;
function startJarvis() {
  if (started) return;
  started = true;

  // ---- Persönlichkeit ----
  const today = new Date();
  const systemPrompt = {
    role: "system",
    content: `Du bist JARVIS, der persönliche KI-Assistent und das "zweite Gehirn" von Luca (14, lernt programmieren).

PERSÖNLICHKEIT:
- Du sprichst Deutsch, höflich, knapp, mit einer Prise Humor. Du duzt Luca.
- Du bist motivierend, erklärst einfach und denkst aktiv mit.

DEIN WICHTIGSTER ZWECK – ZWEITES GEHIRN (Obsidian):
- Du hilfst Luca, sein Wissen in Obsidian zu ERWEITERN, nicht nur abzurufen.
- Wenn er etwas Interessantes erzählt, lernt oder eine Idee hat, biete an, es zu
  speichern (save_to_daily_note oder create_note) – oder tu es, wenn er zustimmt.
- Wenn er eine Frage zu seinem Wissen stellt, suche zuerst in den Notizen
  (search_notes), lies bei Bedarf die ganze Notiz (read_note), und VERKNÜPFE
  Ideen über mehrere Notizen hinweg.
- Schlage aktiv Verbindungen vor ("Das passt zu deiner Notiz über X").
- Beim Schreiben in Notizen nutze sauberes Markdown (Überschriften, Listen, #tags).

WEITERE WERKZEUGE: Uhrzeit/Datum, Wetter & Vorhersage, Websuche (für aktuelle
Fakten), Vault-Statistik, zuletzt bearbeitete Notizen, Timer/Erinnerungen.
Nutze Werkzeuge selbstständig, wenn sie helfen.

Halte gesprochene Antworten natürlich und nicht zu lang. Heute ist ${today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
  };

  // ---- Gedächtnis (überlebt einen Seiten-Neuladen) ----
  let history = [systemPrompt];
  try {
    const saved = JSON.parse(localStorage.getItem("jarvis_history") || "[]");
    if (Array.isArray(saved) && saved.length) history = [systemPrompt, ...saved];
  } catch (e) {}

  function pushHistory(msg) {
    history.push(msg);
    // Verlauf begrenzen (System-Prompt + letzte 24 Nachrichten) – spart Kosten
    if (history.length > 25) history = [systemPrompt, ...history.slice(history.length - 24)];
    try { localStorage.setItem("jarvis_history", JSON.stringify(history.slice(1))); } catch (e) {}
  }

  const setStatus = (s) => { $("status").textContent = s.toUpperCase(); };

  // ---- animierter Hintergrund + Gauges starten ----
  HUDFX.initBackground();
  const gLoad = HUDFX.makeGauge("g-load");
  const gMem = HUDFX.makeGauge("g-mem");
  let simLoad = 0.3;

  // ---- Aktivitäts-Log (zeigt, was JARVIS gerade tut) ----
  function logActivity(text) {
    const el = $("log");
    if (!el) return;
    const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = `${time}  ${text}`;
    el.prepend(line);
    while (el.children.length > 30) el.removeChild(el.lastChild);
  }

  // ---- Vault-Panel (Zweites Gehirn) füllen ----
  function showStats(s) {
    if (!s) return;
    $("v-notes").textContent = s.notes;
    $("v-folders").textContent = s.folders;
    $("v-tags").innerHTML = (s.tags || []).map(t => `<span class="tag">#${t}</span>`).join("");
  }
  async function refreshVault() {
    if (!Obsidian.connected()) return;
    try {
      showStats(await Obsidian.stats());
      const rec = await Obsidian.recent(6);
      $("v-recent").innerHTML = rec.map(n => `<span class="n">• ${n.path}</span>`).join("") || "—";
    } catch (e) { /* still */ }
  }

  // ---- Uhr ----
  const tick = () => {
    const n = new Date(), p = (x) => String(x).padStart(2, "0");
    $("time").textContent = `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
    $("date").textContent = `${p(n.getDate())}.${p(n.getMonth() + 1)}.${n.getFullYear()}`;
  };
  tick(); setInterval(tick, 1000);

  // ---- Systeminfo + Gauges ----
  setInterval(() => {
    // Speicher (echt, nur Chrome) → Gauge "MEM"
    const m = performance.memory;
    gMem.set(m ? m.usedJSHeapSize / m.jsHeapSizeLimit : 0.4, "MEM");
    // "Load" simuliert sanft schwankend (steigt, wenn JARVIS arbeitet)
    simLoad += (Math.random() - 0.5) * 0.08;
    simLoad = Math.max(0.12, Math.min(0.92, simLoad));
    gLoad.set(simLoad, "CORE");
    $("net-val").textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
  }, 1200);

  // ---- Wetter-Widget + Standort merken ----
  let myLat = 47.37, myLon = 8.54; // Fallback: Zürich
  async function loadWeatherWidget() {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${myLat}&longitude=${myLon}&current=temperature_2m,weather_code`);
      const d = await r.json();
      $("weather-temp").textContent = Math.round(d.current.temperature_2m) + "°";
      const codes = { 0: "☀️ Klar", 1: "🌤 Meist klar", 2: "⛅ Bewölkt", 3: "☁️ Bedeckt", 45: "🌫 Nebel", 61: "🌧 Regen", 71: "❄️ Schnee", 80: "🌧 Schauer", 95: "⛈ Gewitter" };
      $("weather-desc").textContent = codes[d.current.weather_code] || "--";
    } catch (e) { $("weather-desc").textContent = "n/a"; }
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => { myLat = p.coords.latitude; myLon = p.coords.longitude; loadWeatherWidget(); },
      () => loadWeatherWidget(),
      { timeout: 5000 }
    );
  } else loadWeatherWidget();
  setInterval(loadWeatherWidget, 600000);

  // ========================================================
  // WERKZEUG-KONTEXT (Helfer, die die Tools brauchen)
  // ========================================================
  const ctx = {
    location: () => ({ lat: myLat, lon: myLon }),
    webSearch: (q) => api("/api/search", { query: q }),
    ensureVault: async () => {
      if (Obsidian.connected()) return true;
      return await Obsidian.reconnect();
    },
    scheduleTimer: (secs, label) => {
      logActivity(`⏳ Timer läuft (${secs}s)`);
      setTimeout(() => {
        logActivity("⏰ Timer abgelaufen");
        speak(`Erinnerung${label ? ": " + label : ""}! Die Zeit ist um.`);
      }, secs * 1000);
    },
    onStats: showStats, // Vault-Statistik direkt ins HUD spiegeln
  };

  // ========================================================
  // GEHIRN mit Function-Calling (Agenten-Loop)
  // Das Modell darf mehrmals Werkzeuge benutzen, bevor es antwortet.
  // ========================================================
  async function converse(userText) {
    pushHistory({ role: "user", content: userText });
    let rounds = 0;
    while (rounds++ < 6) {
      const { message } = await api("/api/chat", { messages: history, tools: TOOL_SCHEMAS });
      pushHistory(message);

      // Will das Modell ein Werkzeug benutzen?
      if (message.tool_calls && message.tool_calls.length) {
        for (const call of message.tool_calls) {
          let args = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch (e) {}
          logActivity(`🔧 ${call.function.name}`);
          let result;
          try { result = await runTool(call.function.name, args, ctx); }
          catch (e) { result = "Fehler im Werkzeug: " + e.message; }
          pushHistory({ role: "tool", tool_call_id: call.id, content: String(result) });
        }
        continue; // mit den Werkzeug-Ergebnissen erneut fragen
      }
      return message.content || "";
    }
    return "Das hat leider zu viele Schritte gebraucht. Frag mich gern nochmal anders.";
  }

  // ========================================================
  // STIMME RAUS (ElevenLabs über /api/tts)
  // ========================================================
  async function speak(text) {
    if (!text) { setStatus("IDLE"); return; }
    setStatus("SPEAKING");
    Viz.setLevel(0.6);
    try {
      const blob = await api("/api/tts", { text }, true);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      try {
        const ac = new AudioContext();
        const src = ac.createMediaElementSource(audio);
        const an = ac.createAnalyser();
        an.fftSize = 128;
        src.connect(an); an.connect(ac.destination);
        const buf = new Uint8Array(an.frequencyBinCount);
        (function loop() {
          if (audio.ended || audio.paused) { Viz.setLevel(0); return; }
          an.getByteFrequencyData(buf);
          Viz.setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
          requestAnimationFrame(loop);
        })();
        await audio.play();
      } catch (e) {
        await audio.play();
      }
      await new Promise((r) => audio.addEventListener("ended", r));
      URL.revokeObjectURL(url);
    } catch (e) {
      logActivity("⚠️ Stimme-Fehler: " + e.message);
    } finally {
      Viz.setLevel(0);
      setStatus("IDLE");
      relistenWake(); // nach dem Sprechen wieder aufs Wake-Word lauschen
    }
  }

  // ========================================================
  // HAUPT-LOOP: Eingabe → Gehirn (+Werkzeuge) → Stimme
  // ========================================================
  async function run(text) {
    if (!text || !text.trim()) return;
    $("transcript").textContent = "Du: " + text;
    logActivity("💬 " + text);
    setStatus("THINKING");
    Viz.setLevel(0.2);
    try {
      const reply = await converse(text);
      $("transcript").textContent = "JARVIS: " + reply;
      refreshVault(); // Vault-Panel aktualisieren (falls Notizen geändert)
      await speak(reply);
    } catch (e) {
      console.error(e);
      $("transcript").textContent = "Fehler: " + e.message;
      logActivity("⚠️ " + e.message);
      setStatus("IDLE"); Viz.setLevel(0);
    }
  }

  // ---- Texteingabe ----
  $("sendBtn").addEventListener("click", () => {
    const v = $("textInput").value;
    $("textInput").value = "";
    run(v);
  });
  $("textInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sendBtn").click(); });

  // ---- Gespräch zurücksetzen ----
  $("resetBtn").addEventListener("click", () => {
    history = [systemPrompt];
    localStorage.removeItem("jarvis_history");
    $("transcript").textContent = "Gedächtnis gelöscht. Neuer Start.";
    logActivity("🗑️ Gespräch zurückgesetzt");
  });

  // ========================================================
  // STIMME REIN (Mikro → Whisper über /api/stt)
  // ========================================================
  let mediaRec = null, chunks = [], micActive = false;
  const micBtn = $("micBtn");

  async function startMic() {
    if (micActive) return;
    micActive = true; chunks = [];
    micBtn.classList.add("recording");
    setStatus("LISTENING"); Viz.setLevel(0.5);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRec.start();
    } catch (e) {
      micActive = false;
      micBtn.classList.remove("recording");
      setStatus("IDLE"); Viz.setLevel(0);
      logActivity("⚠️ Kein Mikro-Zugriff");
    }
  }

  async function stopMic() {
    if (!micActive || !mediaRec) return;
    micActive = false;
    micBtn.classList.remove("recording");
    setStatus("PROCESSING");
    await new Promise((r) => { mediaRec.onstop = r; mediaRec.stop(); });
    mediaRec.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: "audio/webm" });
    try {
      const b64 = await blobToBase64(blob);
      const d = await api("/api/stt", { audio: b64, mime: "audio/webm" });
      if (d.text && d.text.trim()) run(d.text);
      else { setStatus("IDLE"); Viz.setLevel(0); relistenWake(); }
    } catch (e) {
      console.error(e);
      $("transcript").textContent = "Fehler: " + e.message;
      setStatus("IDLE"); Viz.setLevel(0); relistenWake();
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }

  micBtn.addEventListener("mousedown", startMic);
  micBtn.addEventListener("mouseup", stopMic);
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
  micBtn.addEventListener("touchend", stopMic);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement !== $("textInput")) { e.preventDefault(); startMic(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && document.activeElement !== $("textInput")) stopMic();
  });

  // ========================================================
  // OBSIDIAN-VAULT verbinden (Knopf 📂)
  // ========================================================
  const vaultBtn = $("vaultBtn");
  if (!Obsidian.isSupported()) {
    vaultBtn.textContent = "📂 n/a";
    vaultBtn.title = "Obsidian-Zugriff braucht Chrome oder Edge";
  }
  vaultBtn.addEventListener("click", async () => {
    try {
      if (await Obsidian.reconnect()) {
        vaultBtn.classList.add("active");
        logActivity("📂 Vault wiederverbunden");
        refreshVault();
        return;
      }
      await Obsidian.pick();
      vaultBtn.classList.add("active");
      logActivity("📂 Vault verbunden");
      refreshVault();
    } catch (e) {
      logActivity("⚠️ Vault: " + e.message);
    }
  });
  // Beim Start still versuchen, den gespeicherten Vault zu reaktivieren
  Obsidian.reconnect().then((ok) => { if (ok) { vaultBtn.classList.add("active"); refreshVault(); } });

  // ========================================================
  // WAKE-WORD "JARVIS" (Chrome-Spracherkennung, KEIN Key nötig)
  // ========================================================
  const wakeBtn = $("wakeBtn");
  let recognition = null, wakeOn = false;

  function relistenWake() {
    if (wakeOn && recognition && !micActive) {
      try { recognition.start(); } catch (e) {}
    }
  }

  (function initWake() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { wakeBtn.textContent = "👂 n/a"; wakeBtn.title = "Braucht Chrome/Edge"; return; }
    recognition = new SR();
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      if (micActive) return;
      const txt = Array.from(e.results).map(r => r[0].transcript).join(" ").toLowerCase();
      if (/(jarvis|jervis|dscharvis|service)/.test(txt)) {
        try { recognition.stop(); } catch (er) {}
        logActivity("👂 Wake-Word erkannt");
        startMic();
        setTimeout(() => { if (micActive) stopMic(); }, 4500);
      }
    };
    recognition.onend = () => relistenWake();
    recognition.onerror = () => {};
  })();

  wakeBtn.addEventListener("click", () => {
    if (!recognition) return;
    wakeOn = !wakeOn;
    if (wakeOn) {
      wakeBtn.textContent = "👂 AN"; wakeBtn.classList.add("active");
      try { recognition.start(); } catch (e) {}
      logActivity("👂 Wake-Word aktiviert");
    } else {
      wakeBtn.textContent = "👂 AUS"; wakeBtn.classList.remove("active");
      try { recognition.stop(); } catch (e) {}
      logActivity("👂 Wake-Word aus");
    }
  });

  setStatus("IDLE");
  logActivity("✅ JARVIS bereit");
  console.log("JARVIS bereit (Function-Calling, alle Features).");
}
