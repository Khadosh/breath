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

  const beep = useCallback((kind) => {
    if (mutedRef.current || volRef.current <= 0 || document.hidden) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const freq = kind === "inhale" ? 396 : kind === "exhale" ? 264 : 330;
      o.frequency.value = freq;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25 * volRef.current, ctx.currentTime + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch { /* sin audio, seguimos */ }
  }, []);

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
  }, [cycleMs, releaseWake]);

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
    beep(kindOf(mode.phases[idxRef.current].key));

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
        setPhaseIdx(i);
        beep(kindOf(mode.phases[i].key));
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
        beep("exhale");
        applyScale(scaleFor("inhale", 0, reduced.current));
        applyProg(0);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [mode, remaining, done, reset, beep, cycleMs, acquireWake, releaseWake, applyScale, applyProg]);

  const toggle = useCallback(() => { if (running) stop(); else start(); }, [running, stop, start]);

  useEffect(() => () => { cancelAnimationFrame(raf.current); releaseWake(); }, [releaseWake]);

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
      if (e.code === "Space" && e.target.tagName !== "INPUT") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const ratioDots = mode.phases.map((p) => `${p.secs}s`).join(" · ");
  const ratioSlash = mode.phases.map((p) => `${p.secs}s`).join(" / ");

  // — label anterior para el crossfade Inhalá→Exhalá —
  const labelHist = useRef({ cur: phase.label, prev: null });
  if (labelHist.current.cur !== phase.label) {
    labelHist.current = { cur: phase.label, prev: labelHist.current.cur };
  }
  const ghostLabel = running ? labelHist.current.prev : null;

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
          height:100dvh; width:100%; overflow:hidden; position:relative;
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
          padding:8px 15px; border-radius:999px; cursor:pointer; transition:color .2s;
        }
        .mode-btn:hover{ color:var(--txt); }
        .mode-btn[aria-pressed="true"]{
          color:var(--mint); background:#20362F;
          box-shadow:0 0 0 2px #9FE8C9, 0 0 16px rgba(160,235,200,.45);
        }
        .mode-btn:focus-visible{ outline:2px solid var(--mint); outline-offset:2px; }
        .sub{ font-size:13px; color:#CBD8D2; letter-spacing:.02em;
          margin:10px 0 0; text-align:center; min-height:18px; }
        .stage{ position:relative; width:100%; flex:1; min-height:0;
          --disc:min(320px, 42dvh, 70vw); }
        .layer{ position:absolute; top:50%; left:50%;
          transform:translate(-50%,-50%); pointer-events:none; }
        .wave{ width:684px; height:200px; opacity:.38; }
        .halo{ width:calc(var(--disc)*1.45); aspect-ratio:1; border-radius:50%;
          background:radial-gradient(circle, rgba(214,112,60,.44), rgba(214,112,60,.14) 48%, transparent 72%);
          filter:blur(4px); transform:translate(-50%,-50%) scale(.72); will-change:transform; }
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
        .phase-wrap{ position:relative; display:grid; place-items:center; }
        .phase{ font-family:'Fraunces',serif; font-weight:500;
          font-size:clamp(26px, calc(var(--disc)*0.22), 44px);
          text-transform:uppercase; letter-spacing:.06em; color:#F6F3ED; line-height:1;
          text-shadow:0 2px 18px rgba(0,0,0,.35); grid-area:1/1; white-space:nowrap; }
        .phase-in{ animation:phaseIn .55s ease-out both; }
        .phase-out{ animation:phaseOut .45s ease-in both; }
        @keyframes phaseIn{ from{ opacity:0; transform:translateY(9px); } to{ opacity:1; transform:none; } }
        @keyframes phaseOut{ from{ opacity:1; transform:none; } to{ opacity:0; transform:translateY(-9px); } }
        @media (prefers-reduced-motion: reduce){
          .phase-in,.phase-out{ animation-duration:.01s; }
        }
        .count{ font-size:14px; color:#CBD3DC; margin-top:11px; letter-spacing:.14em; }
        .done-txt{ font-family:'Fraunces',serif; font-size:28px; letter-spacing:.08em;
          text-transform:uppercase; color:var(--mint); }
        .panel{ width:100%; max-width:440px; background:rgba(52,59,73,.88);
          border-radius:24px; padding:13px 15px 9px; margin-top:6px;
          box-shadow:0 12px 34px rgba(0,0,0,.28); }
        .panel-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .icon-col{ display:flex; flex-direction:column; align-items:center; gap:6px;
          background:none; border:none; color:#C7CDD6; cursor:pointer; padding:0;
          font-family:inherit; font-size:10.5px; letter-spacing:.12em; }
        .icon-col:hover .icon-circle{ background:#454D5E; }
        .icon-col:focus-visible{ outline:2px solid var(--mint); outline-offset:3px; border-radius:10px; }
        .icon-circle{ width:44px; height:44px; border-radius:50%; background:#3A4150;
          display:grid; place-items:center; transition:background .2s; }
        .play{ display:flex; align-items:center; justify-content:center; gap:8px;
          font-family:inherit; font-weight:700; font-size:clamp(11px,3.2vw,14px);
          letter-spacing:.04em; color:var(--ink); border:none; border-radius:999px;
          background:linear-gradient(180deg,#C4F8E1,#8FE7C4);
          padding:16px 14px; flex:1; max-width:238px; cursor:pointer; white-space:nowrap;
          box-shadow:0 6px 24px rgba(150,240,200,.35); transition:transform .12s ease; }
        .play:hover{ transform:translateY(-1px); }
        .play:focus-visible{ outline:2px solid var(--mint); outline-offset:3px; }
        .sound-block{ display:flex; flex-direction:column; align-items:center; gap:4px; }
        .sound-title{ font-size:10px; color:#A9B1BF; letter-spacing:.02em;
          text-align:center; max-width:90px; line-height:1.3; }
        .sound-row{ display:flex; align-items:center; gap:5px; }
        .sound-btn{ background:none; border:none; color:#E8ECF0; cursor:pointer; padding:2px;
          display:grid; place-items:center; }
        .sound-btn:focus-visible{ outline:2px solid var(--mint); outline-offset:2px; border-radius:6px; }
        .sound-row input[type=range]{ -webkit-appearance:none; appearance:none;
          width:56px; height:18px; background:transparent; cursor:pointer; }
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
        .sparkle{ color:var(--mint); font-size:12px; line-height:1; opacity:.85; }
        .meta{ display:flex; justify-content:space-between; align-items:flex-end;
          margin-top:12px; padding:0 5px; }
        .meta .cell{ display:flex; flex-direction:column; gap:3px; }
        .meta .cell:last-child{ align-items:flex-end; }
        .meta .lbl{ font-size:9.5px; letter-spacing:.12em; color:#8D96A5; text-transform:uppercase; }
        .meta .val{ font-size:13.5px; color:var(--txt); font-weight:700; white-space:nowrap; }
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
      `}</style>

      <div ref={modesEl} className="modes-scroll" role="group" aria-label="Modos de respiración">
        <div className="modes-group">
          {MODES.map((m) => (
            <button key={m.id} className="mode-btn" aria-pressed={m.id === modeId}
              onClick={(ev) => pickMode(m, ev)}>{m.name}</button>
          ))}
        </div>
      </div>
      <div className="sub">{mode.sub}</div>

      <div className="stage">
        <svg className="wave layer" viewBox="0 0 684 200" aria-hidden="true">
          <path d={WAVE_PATH} fill="none" stroke="#8A93A3" strokeWidth="1.6" />
        </svg>
        <div ref={haloEl} className="halo layer" />
        <svg className="ring-svg layer" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r={R} fill="none" stroke="var(--line)" strokeWidth="1.5" />
          <circle ref={arcEl} cx="200" cy="200" r={R} fill="none" stroke="var(--mint)" strokeWidth="2"
            strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC}
            transform="rotate(-90 200 200)"
            style={{ opacity: running ? 0.5 : 0, transition: "opacity .3s" }} />
        </svg>
        <div ref={discEl} className="disc layer" />
        <div className="center">
          {done ? (
            <div className="done-txt">Listo</div>
          ) : (
            <>
              <div className="phase-wrap">
                <div className="phase phase-in" key={`${phaseIdx}-${phase.label}`}>{phase.label}</div>
                {ghostLabel && (
                  <div className="phase phase-out" aria-hidden="true"
                    key={`ghost-${phaseIdx}`}>{ghostLabel}</div>
                )}
              </div>
              <div className="count">{running ? `${counter}s` : ratioDots}</div>
            </>
          )}
        </div>
      </div>

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

          <button className="play" onClick={toggle}>
            {running ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="5" y="4" width="5" height="16" rx="1.5" />
                <rect x="14" y="4" width="5" height="16" rx="1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 4.5v15c0 .9 1 1.5 1.8 1l12-7.5c.7-.5.7-1.5 0-2L8.8 3.5C8 3 7 3.6 7 4.5Z" />
              </svg>
            )}
            {running ? "PAUSAR SESIÓN" : done ? "OTRA SESIÓN" : "COMENZAR SESIÓN"}
          </button>

          <div className="sound-block">
            <span className="sound-title">Ajustes de Sonido</span>
            <div className="sound-row">
              <button className="sound-btn" onClick={() => setMuted((m) => !m)}
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
                onChange={(ev) => setVolume(parseFloat(ev.target.value))} />
            </div>
            <span className="sound-label">SONIDO</span>
            <span className="sparkle" aria-hidden="true">✦</span>
          </div>
        </div>

        <div className="meta">
          <div className="cell">
            <span className="lbl">Ritmo Actual</span>
            <span className="val">{ratioSlash}</span>
          </div>
          <div className="cell">
            <span className="lbl">Tiempo Restante</span>
            <span className="val">{fmt(remaining ?? mode.defaultMin * 60)} Min</span>
          </div>
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
