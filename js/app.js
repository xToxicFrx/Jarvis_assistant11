// ============================================================
// JARVIS — Browser-Logik (sichere Version)
// Ruft NIE direkt OpenAI/ElevenLabs. Stattdessen unsere eigenen
// Server-Funktionen /api/chat, /api/tts, /api/stt.
// Die API-Keys liegen sicher auf dem Server (Vercel), nicht hier.
// ============================================================

// --- Hilfsfunktionen zum Holen von HTML-Elementen ---
const $ = (id) => document.getElementById(id);

// Das persönliche Passwort merken wir uns nur für diese Browser-Sitzung.
let appPassword = sessionStorage.getItem("jarvis_pw") || "";

// ============================================================
// API-AUFRUF mit Passwort im Header
// ============================================================
async function api(path, body, wantAudio = false) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-password": appPassword, // unser Zugangsschutz
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    // Passwort falsch -> zurück zum Login
    sessionStorage.removeItem("jarvis_pw");
    showLogin("Passwort abgelehnt. Bitte erneut eingeben.");
    throw new Error("Nicht autorisiert");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || ("Fehler " + res.status));
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
  // Test: ein winziger Chat-Aufruf prüft das Passwort.
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

// Wenn schon ein Passwort gespeichert ist, direkt versuchen
if (appPassword) {
  $("login").classList.add("hidden");
  $("hud").classList.remove("hidden");
  // Wir starten und prüfen das Passwort beim ersten echten Aufruf.
  startJarvis();
}

// ============================================================
// HAUPT-APP
// ============================================================
let started = false;
function startJarvis() {
  if (started) return; // nur einmal starten
  started = true;

  // Gesprächsverlauf (Persönlichkeit von JARVIS im System-Prompt)
  const history = [{
    role: "system",
    content: `Du bist JARVIS, ein persönlicher KI-Assistent. Du antwortest auf Deutsch, bist höflich, knapp und hilfreich. Heute ist ${new Date().toLocaleDateString("de-DE")}.`,
  }];

  const setStatus = (s) => { $("status").textContent = s.toUpperCase(); };

  // ---- Uhr ----
  const tick = () => {
    const n = new Date(), p = (x) => String(x).padStart(2, "0");
    $("time").textContent = `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
    $("date").textContent = `${p(n.getDate())}.${p(n.getMonth() + 1)}.${n.getFullYear()}`;
  };
  tick(); setInterval(tick, 1000);

  // ---- Systeminfo ----
  setInterval(() => {
    const m = performance.memory;
    if (m) $("mem-bar").style.width = (m.usedJSHeapSize / m.jsHeapSizeLimit * 100).toFixed(0) + "%";
    $("net-val").textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
  }, 2000);

  // ---- Wetter (Open-Meteo, kein Key nötig) ----
  async function loadWeather(lat, lon) {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
      const d = await r.json();
      $("weather-temp").textContent = Math.round(d.current.temperature_2m) + "°";
      const codes = { 0: "☀️ Klar", 1: "🌤 Meist klar", 2: "⛅ Bewölkt", 3: "☁️ Bedeckt", 45: "🌫 Nebel", 48: "🌫 Nebel", 51: "🌦 Niesel", 61: "🌧 Regen", 71: "❄️ Schnee", 80: "🌧 Schauer", 95: "⛈ Gewitter" };
      $("weather-desc").textContent = codes[d.current.weather_code] || "--";
    } catch (e) { $("weather-desc").textContent = "n/a"; }
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => loadWeather(p.coords.latitude, p.coords.longitude),
      () => loadWeather(47.37, 8.54),
      { timeout: 5000 }
    );
  } else loadWeather(47.37, 8.54);

  // ========================================================
  // GEHIRN: Text -> /api/chat
  // ========================================================
  async function askBrain(text) {
    history.push({ role: "user", content: text });
    const d = await api("/api/chat", { messages: history });
    history.push({ role: "assistant", content: d.reply });
    return d.reply;
  }

  // ========================================================
  // STIMME RAUS: Text -> /api/tts -> abspielen
  // ========================================================
  async function speak(text) {
    setStatus("SPEAKING");
    Viz.setLevel(0.6);
    const blob = await api("/api/tts", { text }, true);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    // Visualizer mit echter Lautstärke animieren
    try {
      const ac = new AudioContext();
      const src = ac.createMediaElementSource(audio);
      const an = ac.createAnalyser();
      an.fftSize = 128;
      src.connect(an); an.connect(ac.destination);
      const buf = new Uint8Array(an.frequencyBinCount);
      (function loop() {
        if (audio.ended || audio.paused) { Viz.setLevel(0); setStatus("IDLE"); return; }
        an.getByteFrequencyData(buf);
        Viz.setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
        requestAnimationFrame(loop);
      })();
      audio.play();
    } catch (e) {
      audio.play();
      audio.addEventListener("ended", () => { Viz.setLevel(0); setStatus("IDLE"); });
    }
    await new Promise((r) => audio.addEventListener("ended", r));
  }

  // ========================================================
  // HAUPT-LOOP: Eingabe -> Gehirn -> Stimme
  // ========================================================
  async function run(text) {
    if (!text || !text.trim()) return;
    $("transcript").textContent = "Du: " + text;
    setStatus("THINKING");
    Viz.setLevel(0.2);
    try {
      const reply = await askBrain(text);
      $("transcript").textContent = "JARVIS: " + reply;
      await speak(reply);
    } catch (e) {
      console.error(e);
      $("transcript").textContent = "Fehler: " + e.message;
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

  // ========================================================
  // STIMME REIN: Mikro -> Base64 -> /api/stt -> Gehirn
  // ========================================================
  let mediaRec = null, chunks = [], micActive = false;
  const micBtn = $("micBtn");

  async function startMic() {
    if (micActive) return;
    micActive = true; chunks = [];
    micBtn.classList.add("recording");
    setStatus("LISTENING"); Viz.setLevel(0.5);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRec.start();
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
      // Audio in Base64 verwandeln (damit es als JSON zum Server kann)
      const b64 = await blobToBase64(blob);
      const d = await api("/api/stt", { audio: b64, mime: "audio/webm" });
      if (d.text && d.text.trim()) run(d.text);
      else { setStatus("IDLE"); Viz.setLevel(0); }
    } catch (e) {
      console.error(e);
      $("transcript").textContent = "Fehler: " + e.message;
      setStatus("IDLE"); Viz.setLevel(0);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]); // nur den Base64-Teil
      reader.readAsDataURL(blob);
    });
  }

  micBtn.addEventListener("mousedown", startMic);
  micBtn.addEventListener("mouseup", stopMic);
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
  micBtn.addEventListener("touchend", stopMic);

  // Leertaste = Push-to-Talk (außer beim Tippen im Textfeld)
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement !== $("textInput")) { e.preventDefault(); startMic(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && document.activeElement !== $("textInput")) stopMic();
  });

  setStatus("IDLE");
  console.log("JARVIS bereit (sichere Version).");
}
