import React, { useState, useEffect, useRef, useCallback } from "react";

// — Modos: cada uno es una secuencia de fases. —
const MODES = [
  {
    id: "resonancia",
    name: "Resonancia",
    sub: "Configuración de Base: Tono Vagal, HRV",
    defaultMin: 10,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 5.5 },
      { key: "exhale", label: "Exhalá", secs: 5.5 },
    ],
  },
  {
    id: "calma",
    name: "Calma",
    sub: "Reset Rápido: Baja el Estrés Agudo",
    defaultMin: 3,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 4 },
      { key: "exhale", label: "Exhalá", secs: 6 },
    ],
  },
  {
    id: "dormir",
    name: "Dormir",
    sub: "Pre-Sueño: 4-7-8, Baja Cortisol",
    defaultMin: 5,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 4 },
      { key: "hold", label: "Sostené", secs: 7 },
      { key: "exhale", label: "Exhalá", secs: 8 },
    ],
  },
  {
    id: "foco",
    name: "Foco",
    sub: "Box Breathing: Claridad Mental",
    defaultMin: 4,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 4 },
      { key: "hold", label: "Sostené", secs: 4 },
      { key: "exhale", label: "Exhalá", secs: 4 },
      { key: "hold2", label: "Sostené", secs: 4 },
    ],
  },
  {
    id: "energia",
    name: "Energía",
    sub: "Activación Suave: Sin Ansiedad",
    defaultMin: 3,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 4 },
      { key: "hold", label: "Sostené", secs: 2 },
      { key: "exhale", label: "Exhalá", secs: 4 },
    ],
  },
];

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const fmt = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};
const kindOf = (key) =>
  key.startsWith("inhale") ? "inhale" : key.startsWith("exhale") ? "exhale" : "hold";
const FREQ = { inhale: 396, exhale: 264, hold: 330 };

// escala del disco para una fase y su progreso (0..1)
const scaleFor = (key, prog, reducedMotion) => {
  if (reducedMotion) return key === "exhale" || key === "hold2" ? 0.76 : 0.92;
  const e = easeInOutSine(prog);
  if (key.startsWith("inhale")) return 0.72 + 0.28 * e;
  if (key.startsWith("exhale")) return 1.0 - 0.28 * e;
  return key === "hold" ? 1.0 : 0.72; // hold tras inhalar / hold2 tras exhalar
};

// — onda decorativa: dos ráfagas de sinusoide con envolvente gaussiana —
const WAVE_PATH = (() => {
  let d = "M0 100";
  for (let x = 4; x <= 684; x += 4) {
    const g1 = Math.exp(-((x - 95) ** 2) / (2 * 55 ** 2));
    const g2 = Math.exp(-((x - 589) ** 2) / (2 * 55 ** 2));
    const y = 100 - Math.sin(x / 9) * 46 * (g1 + g2);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return d;
})();

const R = 158; // radio del arco de progreso (viewBox 400)
const CIRC = 2 * Math.PI * R;

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;

// localStorage puede fallar (modo privado, etc.): nunca es fatal
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin persistencia */ } };

// wav silencioso de 1 sample: reproducirlo en loop promueve la sesión de audio
// de iOS a "playback", y así los beeps suenan aunque el switch esté en silencio
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export default function Pacer() {
  const [modeId, setModeId] = useState(() => {
    const s = lsGet("breath-mode");
    return MODES.some((m) => m.id === s) ? s : "resonancia";
  });
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(() => lsGet("breath-muted") === "1");
  const [volume, setVolume] = useState(() => {
    const v = parseFloat(lsGet("breath-vol"));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  });
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [counter, setCounter] = useState(0); // segundos restantes de la fase (entero)
  const [remaining, setRemaining] = useState(null); // seg restantes de sesión (entero)
  const [done, setDone] = useState(false);
  const [installHint, setInstallHint] = useState(null); // 'ios' | 'android' | null
  const [installEvt, setInstallEvt] = useState(null);

  const mode = MODES.find((m) => m.id === modeId);
  const phase = mode.phases[phaseIdx];
  const cycleMs = mode.phases.reduce((a, p) => a + p.secs, 0) * 1000;

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  // — alto real del viewport medido por JS: iOS standalone a veces reporta
  //   mal dvh/fixed y deja una banda muerta abajo; visualViewport no miente —
  useEffect(() => {
    const setVvh = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
    };
    setVvh();
    window.visualViewport?.addEventListener("resize", setVvh);
    window.addEventListener("resize", setVvh);
    window.addEventListener("orientationchange", setVvh);
    return () => {
      window.visualViewport?.removeEventListener("resize", setVvh);
      window.removeEventListener("resize", setVvh);
      window.removeEventListener("orientationchange", setVvh);
    };
  }, []);

  useEffect(() => { lsSet("breath-mode", modeId); }, [modeId]);
  useEffect(() => { lsSet("breath-muted", muted ? "1" : "0"); }, [muted]);
  useEffect(() => { lsSet("breath-vol", String(volume)); }, [volume]);

  // — al abrir con un modo persistido fuera de vista (p.ej. Energía), centrarlo —
  const modesEl = useRef(null);
  useEffect(() => {
    modesEl.current?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  // — hint de instalación: iOS nunca ofrece solo; Android dispara beforeinstallprompt —
  useEffect(() => {
    if (isStandalone() || lsGet("breath-hide-install")) return;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setInstallHint("ios");
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvt(e);
      setInstallHint("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  const dismissHint = () => {
    lsSet("breath-hide-install", "1");
    setInstallHint(null);
  };

  // — refs del loop: el reloj es absoluto (performance.now), no acumulativo,
  //   así una vuelta desde segundo plano retoma en la fase correcta —
  const raf = useRef(0);
  const cycleT0 = useRef(0); // inicio (virtual) del ciclo actual
  const cycleOffset = useRef(0); // ms ya transcurridos del ciclo al pausar
  const idxRef = useRef(0);
  const counterRef = useRef(0);
  const remainRef = useRef(-1);
  const sessionEnd = useRef(0);
  const runningRef = useRef(false);
  const audioCtx = useRef(null);
  const wakeLock = useRef(null);
  const volRef = useRef(volume);
  const mutedRef = useRef(muted);
  volRef.current = volume;
  mutedRef.current = muted;

  // — el disco/halo/arco se animan escribiendo el DOM directo desde el rAF:
  //   sin re-render de React por frame ni transition CSS que "corra a alcanzar"
  //   el valor tras un frame salteado (eso causaba el temblor) —
  const discEl = useRef(null);
  const haloEl = useRef(null);
  const arcEl = useRef(null);

  const applyScale = useCallback((s) => {
    const t = `translate(-50%,-50%) scale(${s.toFixed(4)})`;
    if (discEl.current) discEl.current.style.transform = t;
    if (haloEl.current) haloEl.current.style.transform = t;
  }, []);
  const applyProg = useCallback((p) => {
    if (arcEl.current) arcEl.current.style.strokeDashoffset = `${CIRC * (1 - p)}`;
  }, []);

  const masterGain = useRef(null);
  const silentEl = useRef(null);

  const ensureCtx = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      masterGain.current = audioCtx.current.createGain();
      masterGain.current.gain.value = Math.pow(volRef.current, 1.5);
      masterGain.current.connect(audioCtx.current.destination);
    }
    if (audioCtx.current.state === "suspended") audioCtx.current.resume();
    return audioCtx.current;
  }, []);

  // curva de potencia: el oído percibe el volumen logarítmico, así el slider
  // se siente lineal en vez de "no hacer nada" hasta el final. El mute vive
  // acá también, para que silencie los beeps ya agendados a futuro.
  useEffect(() => {
    if (masterGain.current) masterGain.current.gain.value = muted ? 0 : Math.pow(volume, 1.5);
  }, [volume, muted]);

  const unlockPlayback = useCallback(() => {
    try {
      if (!silentEl.current) {
        const a = new Audio(SILENT_WAV);
        a.loop = true;
        a.setAttribute("playsinline", "");
        a.volume = 0.001;
        silentEl.current = a;
      }
      silentEl.current.play().catch(() => { /* sin gesto todavía */ });
    } catch { /* sin audio, seguimos */ }
  }, []);
  const stopPlaybackSession = useCallback(() => {
    silentEl.current?.pause();
  }, []);

  // — tono agendado en el reloj de WebAudio (sample-accurate): los osciladores
  //   ya programados suenan aunque la pantalla se bloquee —
  const sched = useRef({ timer: 0, lastT: 0, bellDone: false, bounds: [], cycleMs: 0, sources: [] });

  const toneAt = useCallback((ctxTime, freq, peak, dur = 0.5) => {
    const ctx = audioCtx.current;
    if (!ctx || !masterGain.current) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const t = Math.max(ctxTime, ctx.currentTime + 0.01);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(masterGain.current);
      o.start(t);
      o.stop(t + dur + 0.05);
      sched.current.sources.push({ o, g, until: t + dur });
    } catch { /* sin audio, seguimos */ }
  }, []);

  const bellAt = useCallback((ctxTime) => {
    // campanita: parciales con caída larga
    toneAt(ctxTime, 523.25, 0.28, 3.2);
    toneAt(ctxTime, 1046.5, 0.11, 2.2);
    toneAt(ctxTime, 1567.98, 0.05, 1.4);
  }, [toneAt]);

  const clearScheduled = useCallback(() => {
    clearInterval(sched.current.timer);
    sched.current.timer = 0;
    for (const s of sched.current.sources) {
      try { s.o.stop(0); s.o.disconnect(); s.g.disconnect(); } catch { /* ya sonó */ }
    }
    sched.current.sources = [];
  }, []);

  // agenda los beeps de los próximos 5s; corre cada 1s (los timers siguen vivos
  // en segundo plano mientras haya audio activo, y el margen cubre el jitter)
  const runScheduler = useCallback(() => {
    const ctx = audioCtx.current;
    if (!ctx || !runningRef.current) return;
    const s = sched.current;
    const nowPn = performance.now();
    const horizon = nowPn + 5000;

    // limpiar fuentes ya sonadas
    s.sources = s.sources.filter((x) => x.until > ctx.currentTime - 1);

    let t = Math.max(s.lastT, nowPn);
    for (;;) {
      // próximo límite de fase después de t
      let next = null;
      const n = Math.floor((t - cycleT0.current) / s.cycleMs);
      outer: for (let k = n; k <= n + 2; k++) {
        for (const b of s.bounds) {
          const bt = cycleT0.current + k * s.cycleMs + b.at;
          if (bt > t) { next = { bt, key: b.key }; break outer; }
        }
      }
      if (!next || next.bt >= horizon || next.bt >= sessionEnd.current) break;
      const leftMs = sessionEnd.current - next.bt;
      // las últimas respiraciones se van apagando
      const fade = leftMs < s.cycleMs * 0.5 ? 0.3 : leftMs < s.cycleMs ? 0.55 : 1;
      toneAt(ctx.currentTime + (next.bt - nowPn) / 1000, FREQ[kindOf(next.key)], 0.3 * fade);
      t = next.bt;
    }
    s.lastT = t;

    if (!s.bellDone && sessionEnd.current > nowPn && sessionEnd.current < horizon) {
      bellAt(ctx.currentTime + (sessionEnd.current - nowPn) / 1000);
      s.bellDone = true;
    }
  }, [toneAt, bellAt]);

  const beep = useCallback((kind) => {
    if (mutedRef.current || volRef.current <= 0 || document.hidden) return;
    try {
      const ctx = ensureCtx();
      toneAt(ctx.currentTime, FREQ[kind] ?? FREQ.hold, 0.3);
    } catch { /* sin audio, seguimos */ }
  }, [ensureCtx, toneAt]);

  // — wake lock: que la pantalla no se apague durante la sesión —
  const acquireWake = useCallback(async () => {
    try { wakeLock.current = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
  }, []);
  const releaseWake = useCallback(() => {
    try { wakeLock.current?.release(); } catch { /* ya liberado */ }
    wakeLock.current = null;
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (runningRef.current) {
      cycleOffset.current = (performance.now() - cycleT0.current) % cycleMs;
    }
    runningRef.current = false;
    setRunning(false);
    releaseWake();
    clearScheduled();
    stopPlaybackSession();
  }, [cycleMs, releaseWake, stopPlaybackSession, clearScheduled]);

  const reset = useCallback(() => {
    stop();
    cycleOffset.current = 0;
    idxRef.current = 0;
    setPhaseIdx(0);
    setDone(false);
    remainRef.current = mode.defaultMin * 60;
    setRemaining(remainRef.current);
    applyScale(scaleFor("inhale", 0, reduced.current));
    applyProg(0);
  }, [mode, stop, applyScale, applyProg]);

  useEffect(() => { reset(); /* al cambiar de modo */ // eslint-disable-next-line
  }, [modeId]);

  const start = useCallback(() => {
    if (done) reset();
    const now = performance.now();
    cycleT0.current = now - (done ? 0 : cycleOffset.current);
    const total = done ? mode.defaultMin * 60 : (remaining ?? mode.defaultMin * 60);
    sessionEnd.current = now + total * 1000;
    runningRef.current = true;
    setRunning(true);
    setDone(false);
    acquireWake();
    unlockPlayback();
    ensureCtx();
    beep(kindOf(mode.phases[idxRef.current].key));

    // scheduler de audio: límites de fase del ciclo + sesión
    const bounds = [];
    let accMs = 0;
    for (const p of mode.phases) {
      bounds.push({ at: accMs, key: p.key });
      accMs += p.secs * 1000;
    }
    sched.current.bounds = bounds;
    sched.current.cycleMs = cycleMs;
    sched.current.lastT = now;
    sched.current.bellDone = false;
    runScheduler();
    clearInterval(sched.current.timer);
    sched.current.timer = setInterval(runScheduler, 1000);

    // lock screen: metadata + play/pausa
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: `Breath — ${mode.name}`,
          artist: mode.sub,
          artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
        });
        navigator.mediaSession.setActionHandler("play", () => {
          if (!runningRef.current) startRef.current?.();
        });
        navigator.mediaSession.setActionHandler("pause", () => {
          if (runningRef.current) stopRef.current?.();
        });
      }
    } catch { /* sin media session */ }

    const phaseAt = (msInCycle) => {
      let acc = 0;
      for (let i = 0; i < mode.phases.length; i++) {
        const d = mode.phases[i].secs * 1000;
        if (msInCycle < acc + d) return { i, prog: (msInCycle - acc) / d };
        acc += d;
      }
      return { i: mode.phases.length - 1, prog: 1 };
    };

    const tick = (t) => {
      const cyc = (t - cycleT0.current) % cycleMs;
      const { i, prog } = phaseAt(cyc);
      if (i !== idxRef.current) {
        idxRef.current = i;
        setPhaseIdx(i); // el beep del cambio de fase ya está agendado en WebAudio
      }
      applyScale(scaleFor(mode.phases[i].key, prog, reduced.current));
      applyProg(prog);

      const c = Math.max(1, Math.ceil(mode.phases[i].secs * (1 - prog)));
      if (c !== counterRef.current) { counterRef.current = c; setCounter(c); }

      const left = Math.max(0, (sessionEnd.current - t) / 1000);
      const leftInt = Math.floor(left);
      if (leftInt !== remainRef.current) { remainRef.current = leftInt; setRemaining(leftInt); }

      if (left <= 0) {
        runningRef.current = false;
        setRunning(false);
        setDone(true);
        cycleOffset.current = 0;
        releaseWake();
        clearInterval(sched.current.timer);
        // la campanita ya está agendada: mantener viva la sesión de audio
        // hasta que termine de sonar, recién ahí soltarla
        setTimeout(() => { if (!runningRef.current) stopPlaybackSession(); }, 4500);
        applyScale(scaleFor("inhale", 0, reduced.current));
        applyProg(0);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [mode, remaining, done, reset, beep, cycleMs, acquireWake, releaseWake, applyScale, applyProg,
    unlockPlayback, ensureCtx, stopPlaybackSession, runScheduler]);

  // refs estables para los handlers del lock screen
  const startRef = useRef(null);
  const stopRef = useRef(null);
  useEffect(() => { startRef.current = start; stopRef.current = stop; });

  useEffect(() => {
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = running ? "playing" : "paused";
      }
    } catch { /* sin media session */ }
  }, [running]);

  const toggle = useCallback(() => { if (running) stop(); else start(); }, [running, stop, start]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    releaseWake();
    clearScheduled();
  }, [releaseWake, clearScheduled]);

  // — el wake lock se pierde al ir a segundo plano: re-adquirir al volver —
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && runningRef.current) acquireWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [acquireWake]);

  useEffect(() => {
    const onKey = (e) => {
      // botones e inputs ya manejan Space nativamente (evita doble toggle)
      if (e.code === "Space" && !["INPUT", "BUTTON"].includes(e.target.tagName)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const ratioDots = mode.phases.map((p) => `${p.secs}s`).join(" · ");
  const ratioSlash = mode.phases.map((p) => `${p.secs}s`).join(" / ");
  const paused = !running && !done && remaining != null && remaining < mode.defaultMin * 60;


  const pickMode = (m, ev) => {
    setModeId(m.id);
    ev.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <div className="pacer-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Space+Mono:wght@400;700&display=swap');
        .pacer-root{
          --bg-0:#2A303C; --bg-1:#232833; --panel:#343B49; --pill:#3A4150;
          --mint:#A9EFD2; --mint-deep:#7FD8B8; --ink:#14241D;
          --txt:#EFF2F5; --muted:#A0A8B6; --line:rgba(255,255,255,.08);
          position:fixed; top:0; left:0; width:100%;
          height:var(--vvh, 100dvh); overflow:hidden;
          display:flex; flex-direction:column; align-items:center;
          background:linear-gradient(180deg,var(--bg-0),var(--bg-1) 55%,#20242E);
          color:var(--txt); font-family:'Space Mono',ui-monospace,monospace;
          padding:calc(14px + env(safe-area-inset-top)) 14px calc(10px + env(safe-area-inset-bottom));
          user-select:none;
        }
        .modes-scroll{ max-width:100%; display:flex; overflow-x:auto;
          scrollbar-width:none; -webkit-overflow-scrolling:touch;
          mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent);
          -webkit-mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent); }
        .modes-scroll::-webkit-scrollbar{ display:none; }
        .modes-group{ display:flex; width:max-content; margin:0 auto;
          background:var(--pill); border-radius:999px;
          padding:5px; gap:2px; box-shadow:inset 0 2px 6px rgba(0,0,0,.18); }
        .mode-btn{
          background:transparent; border:none; color:#A9B1BF; white-space:nowrap;
          font-family:inherit; font-size:14px; letter-spacing:.02em;
          padding:8px 15px; border-radius:999px; cursor:pointer;
          transition:color .25s, background .3s, box-shadow .3s;
        }
        .mode-btn:hover{ color:var(--txt); }
        .mode-btn[aria-pressed="true"]{
          color:var(--mint); background:#20362F;
          box-shadow:0 0 0 2px #9FE8C9, 0 0 16px rgba(160,235,200,.45);
        }
        .mode-btn:focus-visible{ outline:2px solid var(--mint); outline-offset:2px; }
        .sub{ font-size:13px; color:#CBD8D2; letter-spacing:.02em;
          margin:10px 0 0; text-align:center; min-height:18px;
          animation:phaseIn .35s ease-out both; }
        .stage{ position:relative; width:100%; flex:1; min-height:0;
          --disc:min(340px, calc(var(--vvh, 100dvh) * 0.44), 76vw);
          display:block; border:none; background:none; padding:0; margin:0;
          font:inherit; color:inherit; cursor:pointer;
          -webkit-appearance:none; appearance:none; }
        .stage:focus-visible{ outline:2px solid var(--mint); outline-offset:-3px; border-radius:24px; }
        .hint{ font-size:10.5px; letter-spacing:.2em; text-transform:uppercase;
          color:#8D96A5; margin-top:12px; animation:hintPulse 2.6s ease-in-out infinite; }
        @keyframes hintPulse{ 0%,100%{ opacity:.5; } 50%{ opacity:1; } }
        @media (prefers-reduced-motion: reduce){ .hint{ animation:none; } }
        .layer{ position:absolute; top:50%; left:50%;
          transform:translate(-50%,-50%); pointer-events:none; }
        .wave{ width:684px; height:200px; opacity:.38; }
        .halo{ width:calc(var(--disc)*1.5); aspect-ratio:1; border-radius:50%;
          background:radial-gradient(circle, rgba(214,112,60,.44), rgba(214,112,60,.14) 48%, transparent 72%);
          filter:blur(4px); transform:translate(-50%,-50%) scale(.72); will-change:transform; }
        .halo.idle,.disc.idle{ transition:transform .5s ease; }
        .ring-svg{ width:calc(var(--disc)*1.58); aspect-ratio:1; }
        .disc{ width:var(--disc); aspect-ratio:1; border-radius:50%;
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,.10), transparent 46%),
            radial-gradient(circle at 50% 45%, #39414F, #232935 78%);
          border:4px solid #AFF2D8;
          box-shadow:
            0 0 18px rgba(165,240,205,.6), 0 0 60px rgba(165,240,205,.25),
            inset 0 0 26px rgba(165,240,205,.5), inset 0 16px 34px rgba(255,255,255,.05);
          transform:translate(-50%,-50%) scale(.72); will-change:transform; }
        .center{ position:absolute; inset:0; display:flex; flex-direction:column;
          align-items:center; justify-content:center; pointer-events:none; text-align:center;
          transform:translateY(calc(var(--disc)*0.045)); }
        .phase{ font-family:'Fraunces',serif; font-weight:500;
          font-size:clamp(26px, calc(var(--disc)*0.22), 48px);
          text-transform:uppercase; letter-spacing:.06em; color:#F6F3ED; line-height:1;
          text-shadow:0 2px 18px rgba(0,0,0,.35); white-space:nowrap;
          animation:phaseIn .28s ease-out both; }
        @keyframes phaseIn{ from{ opacity:0; } to{ opacity:1; } }
        .count{ font-size:14px; color:#CBD3DC; margin-top:11px; letter-spacing:.14em; }
        .done-txt{ font-family:'Fraunces',serif; font-size:28px; letter-spacing:.08em;
          text-transform:uppercase; color:var(--mint); animation:phaseIn .5s ease-out both; }
        .panel{ width:100%; max-width:440px; background:rgba(52,59,73,.88);
          border-radius:24px; padding:12px 18px; margin-top:6px;
          box-shadow:0 12px 34px rgba(0,0,0,.28); }
        .panel-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .icon-col{ display:flex; flex-direction:column; align-items:center; gap:6px;
          background:none; border:none; color:#C7CDD6; cursor:pointer; padding:0;
          font-family:inherit; font-size:10.5px; letter-spacing:.12em; }
        .icon-col:hover .icon-circle{ background:#454D5E; }
        .icon-col:focus-visible{ outline:2px solid var(--mint); outline-offset:3px; border-radius:10px; }
        .icon-circle{ width:44px; height:44px; border-radius:50%; background:#3A4150;
          display:grid; place-items:center; transition:background .2s; }
        .metrics{ display:flex; justify-content:center; gap:clamp(20px,8vw,42px);
          margin-top:11px; padding-top:10px; border-top:1px solid rgba(255,255,255,.07); }
        .m-lbl{ font-size:10px; letter-spacing:.16em; color:#8D96A5;
          text-transform:uppercase; white-space:nowrap; }
        .m-lbl b{ font-size:13.5px; color:var(--txt); font-weight:700;
          letter-spacing:.02em; margin-left:7px; text-transform:none; }
        .sound-block{ display:flex; flex-direction:column; align-items:center; gap:5px; }
        .sound-row{ display:flex; align-items:center; gap:5px; }
        .sound-btn{ background:none; border:none; color:#E8ECF0; cursor:pointer; padding:2px;
          display:grid; place-items:center; }
        .sound-btn:focus-visible{ outline:2px solid var(--mint); outline-offset:2px; border-radius:6px; }
        .sound-row input[type=range]{ -webkit-appearance:none; appearance:none;
          width:70px; max-width:70px; flex:0 0 auto; height:18px;
          background:transparent; cursor:pointer; }
        .sound-row input[type=range]::-webkit-slider-runnable-track{
          height:3px; border-radius:2px; background:#4A5262; }
        .sound-row input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none;
          width:11px; height:11px; border-radius:50%; background:var(--mint-deep);
          margin-top:-4px; box-shadow:0 0 6px rgba(160,235,200,.45); }
        .sound-row input[type=range]::-moz-range-track{
          height:3px; border-radius:2px; background:#4A5262; }
        .sound-row input[type=range]::-moz-range-thumb{
          width:11px; height:11px; border:none; border-radius:50%; background:var(--mint-deep);
          box-shadow:0 0 6px rgba(160,235,200,.45); }
        .sound-label{ font-size:10.5px; letter-spacing:.14em; color:#C7CDD6; }
        .install{ display:flex; align-items:center; gap:9px; margin-top:7px;
          font-size:11px; color:#98A1AF; line-height:1.4; max-width:440px; }
        .install .cta{ font-family:inherit; font-weight:700; font-size:11px; border:none;
          border-radius:999px; padding:6px 14px; cursor:pointer;
          background:var(--mint); color:var(--ink); letter-spacing:.04em; }
        .install .dismiss{ background:none; border:none; color:#7C8595; cursor:pointer;
          font-size:15px; padding:2px 6px; line-height:1; }
        @media (max-width:380px){
          .mode-btn{ font-size:12.5px; padding:7px 11px; }
          .panel-row{ gap:8px; }
        }
        @media (max-height:640px){
          .sub{ display:none; }
        }
        @media (min-height:800px){
          .mode-btn{ font-size:15px; padding:10px 17px; }
          .sub{ font-size:14px; margin-top:14px; }
          .count{ font-size:15px; }
          .panel{ padding:15px 20px 13px; border-radius:26px; }
          .icon-circle{ width:48px; height:48px; }
          .m-lbl b{ font-size:14.5px; }
          .wave{ opacity:.42; }
        }
      `}</style>

      <div ref={modesEl} className="modes-scroll" role="group" aria-label="Modos de respiración">
        <div className="modes-group">
          {MODES.map((m) => (
            <button key={m.id} className="mode-btn" aria-pressed={m.id === modeId}
              onClick={(ev) => pickMode(m, ev)}>{m.name}</button>
          ))}
        </div>
      </div>
      <div className="sub" key={modeId}>{mode.sub}</div>

      <button className="stage" onClick={toggle}
        aria-label={running ? "Pausar sesión" : "Comenzar sesión"}>
        <svg className="wave layer" viewBox="0 0 684 200" aria-hidden="true">
          <path d={WAVE_PATH} fill="none" stroke="#8A93A3" strokeWidth="1.6" />
        </svg>
        <div ref={haloEl} className={`halo layer${running ? "" : " idle"}`} />
        <svg className="ring-svg layer" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r={R} fill="none" stroke="var(--line)" strokeWidth="1.5" />
          <circle ref={arcEl} cx="200" cy="200" r={R} fill="none" stroke="var(--mint)" strokeWidth="2"
            strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC}
            transform="rotate(-90 200 200)"
            style={{ opacity: running ? 0.5 : 0, transition: "opacity .3s" }} />
        </svg>
        <div ref={discEl} className={`disc layer${running ? "" : " idle"}`} />
        <div className="center">
          {done ? (
            <>
              <div className="done-txt">Listo</div>
              <div className="hint">tocá para otra</div>
            </>
          ) : (
            <>
              <div className="phase" key={`${phaseIdx}-${phase.label}`}>{phase.label}</div>
              <div className="count">{running ? `${counter}s` : ratioDots}</div>
              {!running && (
                <div className="hint">{paused ? "tocá para seguir" : "tocá para empezar"}</div>
              )}
            </>
          )}
        </div>
      </button>

      <div className="panel">
        <div className="panel-row">
          <button className="icon-col" onClick={reset} aria-label="Reiniciar sesión">
            <span className="icon-circle">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </span>
            REINICIAR
          </button>

          <div className="sound-block">
            <div className="sound-row">
              <button className="sound-btn"
                onClick={() => setMuted((m) => {
                  const next = !m;
                  if (!next) setTimeout(() => { unlockPlayback(); beep("inhale"); }, 0);
                  return next;
                })}
                aria-pressed={muted} aria-label={muted ? "Activar sonido" : "Silenciar"}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z" fill="currentColor" stroke="none" />
                  {muted ? (
                    <>
                      <line x1="15" y1="9" x2="21" y2="15" />
                      <line x1="21" y1="9" x2="15" y2="15" />
                    </>
                  ) : (
                    <>
                      <path d="M14.5 9.2a4 4 0 0 1 0 5.6" />
                      <path d="M17.2 6.8a7.5 7.5 0 0 1 0 10.4" />
                    </>
                  )}
                </svg>
              </button>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                aria-label="Volumen"
                onChange={(ev) => setVolume(parseFloat(ev.target.value))}
                onPointerUp={() => { unlockPlayback(); beep("inhale"); }}
                onKeyUp={() => beep("inhale")} />
            </div>
            <span className="sound-label">SONIDO</span>
          </div>
        </div>

        <div className="metrics">
          <span className="m-lbl">Ritmo <b>{ratioSlash}</b></span>
          <span className="m-lbl">Restante <b>{fmt(remaining ?? mode.defaultMin * 60)}</b></span>
        </div>
      </div>

      {installHint === "ios" && (
        <div className="install">
          <span>Para instalar: tocá <b>Compartir</b> y elegí <b>“Agregar a inicio”</b></span>
          <button className="dismiss" onClick={dismissHint} aria-label="Cerrar aviso">✕</button>
        </div>
      )}
      {installHint === "android" && (
        <div className="install">
          <button className="cta" onClick={() => { installEvt?.prompt(); dismissHint(); }}>
            INSTALAR APP
          </button>
          <button className="dismiss" onClick={dismissHint} aria-label="Cerrar aviso">✕</button>
        </div>
      )}
    </div>
  );
}
