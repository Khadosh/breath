import React, { useState, useEffect, useRef, useCallback } from "react";

// — Modos: cada uno es una secuencia de fases. hold con secs 0 se saltea. —
const MODES = [
  {
    id: "resonancia",
    name: "Resonancia",
    goal: "Base · tono vagal, HRV",
    ratio: "5,5 · 5,5",
    defaultMin: 10,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 5.5 },
      { key: "exhale", label: "Exhalá", secs: 5.5 },
    ],
  },
  {
    id: "calma",
    name: "Calma",
    goal: "Reset cuando saltó el estrés",
    ratio: "4 · 6",
    defaultMin: 3,
    phases: [
      { key: "inhale", label: "Inhalá", secs: 4 },
      { key: "exhale", label: "Exhalá", secs: 6 },
    ],
  },
  {
    id: "dormir",
    name: "Dormir",
    goal: "Pre-sueño · baja cortisol",
    ratio: "4 · 7 · 8",
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
    goal: "Antes de algo demandante",
    ratio: "4 · 4 · 4 · 4",
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
    goal: "Activación suave · no es Wim Hof",
    ratio: "4 · 2 · 4",
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

const R = 132; // radio del anillo
const CIRC = 2 * Math.PI * R;

export default function Pacer() {
  const [modeId, setModeId] = useState("resonancia");
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseProg, setPhaseProg] = useState(0); // 0..1
  const [remaining, setRemaining] = useState(null); // seg restantes de sesión
  const [done, setDone] = useState(false);

  const mode = MODES.find((m) => m.id === modeId);
  const phase = mode.phases[phaseIdx];

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  // — refs del loop —
  const raf = useRef(0);
  const phaseStart = useRef(0);
  const idxRef = useRef(0);
  const sessionEnd = useRef(0);
  const audioCtx = useRef(null);

  const beep = useCallback((kind) => {
    if (!sound) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const freq = kind === "inhale" ? 396 : kind === "exhale" ? 264 : 330;
      o.frequency.value = freq;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch { /* sin audio, seguimos */ }
  }, [sound]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setPhaseIdx(0);
    idxRef.current = 0;
    setPhaseProg(0);
    setDone(false);
    setRemaining(mode.defaultMin * 60);
  }, [mode, stop]);

  useEffect(() => { reset(); /* al cambiar de modo */ // eslint-disable-next-line
  }, [modeId]);

  const start = useCallback(() => {
    if (done) reset();
    const now = performance.now();
    phaseStart.current = now;
    const total = (remaining ?? mode.defaultMin * 60);
    sessionEnd.current = now + total * 1000;
    setRunning(true);
    setDone(false);
    beep(mode.phases[idxRef.current].key.startsWith("inhale") ? "inhale" : "hold");

    const tick = (t) => {
      const cur = mode.phases[idxRef.current];
      const dur = cur.secs * 1000;
      let elapsed = t - phaseStart.current;
      if (elapsed >= dur) {
        phaseStart.current = t;
        const next = (idxRef.current + 1) % mode.phases.length;
        idxRef.current = next;
        setPhaseIdx(next);
        const nk = mode.phases[next].key;
        beep(nk.startsWith("inhale") ? "inhale" : nk.startsWith("exhale") ? "exhale" : "hold");
        elapsed = 0;
      }
      setPhaseProg(Math.min(1, elapsed / dur));

      const left = Math.max(0, (sessionEnd.current - t) / 1000);
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setDone(true);
        beep("exhale");
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [mode, remaining, done, reset, beep]);

  const toggle = useCallback(() => { if (running) stop(); else start(); }, [running, stop, start]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // — escala del disco según fase —
  let scale = 0.62;
  const k = phase.key;
  const e = easeInOutSine(phaseProg);
  if (k.startsWith("inhale")) scale = 0.62 + 0.38 * e;
  else if (k.startsWith("exhale")) scale = 1.0 - 0.38 * e;
  else if (k === "hold") scale = 1.0; // hold tras inhalar
  else scale = 0.62; // hold2 tras exhalar
  if (reduced.current) scale = k.startsWith("inhale") ? 0.85 : k.startsWith("exhale") ? 0.68 : (k === "hold" ? 0.85 : 0.68);

  // — punto orbital (signature): recorre el anillo según progreso de fase —
  const orbitAngle = -90 + phaseProg * 360;
  const ox = 160 + R * Math.cos((orbitAngle * Math.PI) / 180);
  const oy = 160 + R * Math.sin((orbitAngle * Math.PI) / 180);

  const counter = Math.max(1, Math.ceil(phase.secs - phaseProg * phase.secs));

  return (
    <div className="pacer-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Space+Mono:wght@400;700&display=swap');
        .pacer-root{
          --ink-0:#0B1019; --ink-1:#141E2E; --jade:#8FB9A8; --jade-hi:#AEDAC7;
          --paper:#ECF1F3; --mist:#6A798C; --cinnabar:#C8553D; --line:rgba(143,185,168,.16);
          min-height:560px; display:flex; flex-direction:column; align-items:center;
          background:radial-gradient(120% 90% at 50% 0%, var(--ink-1), var(--ink-0) 70%);
          color:var(--paper); font-family:system-ui,-apple-system,sans-serif;
          padding:28px 18px 34px; border-radius:18px; user-select:none;
        }
        .modes{ display:flex; flex-wrap:wrap; gap:7px; justify-content:center; margin-bottom:8px; }
        .mode-btn{
          background:transparent; border:1px solid var(--line); color:var(--mist);
          font-family:'Space Mono',monospace; font-size:12px; letter-spacing:.04em;
          padding:7px 13px; border-radius:999px; cursor:pointer; transition:all .25s ease;
        }
        .mode-btn:hover{ color:var(--paper); border-color:rgba(143,185,168,.4); }
        .mode-btn[aria-pressed="true"]{ color:var(--ink-0); background:var(--jade); border-color:var(--jade); }
        .mode-btn:focus-visible{ outline:2px solid var(--jade-hi); outline-offset:2px; }
        .goal{ font-family:'Space Mono',monospace; font-size:12px; color:var(--mist);
          letter-spacing:.04em; margin:6px 0 14px; min-height:16px; }
        .stage{ position:relative; width:320px; height:320px; }
        .stage svg{ position:absolute; inset:0; }
        .disc{ position:absolute; inset:0; margin:auto; width:200px; height:200px; border-radius:50%;
          background:radial-gradient(circle at 50% 42%, var(--jade-hi), var(--jade) 60%, rgba(143,185,168,.15) 100%);
          box-shadow:0 0 60px 4px rgba(143,185,168,.22);
          transition:transform .12s linear; will-change:transform; }
        .center{ position:absolute; inset:0; display:flex; flex-direction:column;
          align-items:center; justify-content:center; pointer-events:none; }
        .phase{ font-family:'Fraunces',serif; font-weight:500; font-size:34px;
          color:var(--ink-0); line-height:1; }
        .count{ font-family:'Space Mono',monospace; font-size:13px; color:rgba(11,16,25,.62);
          margin-top:6px; letter-spacing:.1em; }
        .controls{ display:flex; align-items:center; gap:14px; margin-top:22px; }
        .play{ font-family:'Space Mono',monospace; font-weight:700; font-size:14px;
          letter-spacing:.06em; color:var(--ink-0); background:var(--paper); border:none;
          padding:13px 30px; border-radius:999px; cursor:pointer; transition:transform .12s ease, background .2s; }
        .play:hover{ transform:translateY(-1px); }
        .play:focus-visible{ outline:2px solid var(--jade-hi); outline-offset:3px; }
        .ghost{ background:transparent; border:1px solid var(--line); color:var(--mist);
          font-family:'Space Mono',monospace; font-size:12px; padding:12px 16px;
          border-radius:999px; cursor:pointer; transition:all .2s; }
        .ghost:hover{ color:var(--paper); border-color:rgba(143,185,168,.4); }
        .ghost:focus-visible{ outline:2px solid var(--jade-hi); outline-offset:2px; }
        .ghost[aria-pressed="true"]{ color:var(--jade); border-color:var(--jade); }
        .meta{ display:flex; gap:22px; margin-top:18px; font-family:'Space Mono',monospace;
          font-size:12px; color:var(--mist); letter-spacing:.05em; }
        .meta b{ color:var(--paper); font-weight:400; }
        .done{ font-family:'Fraunces',serif; font-size:18px; color:var(--jade-hi); }
      `}</style>

      <div className="modes" role="group" aria-label="Modos de respiración">
        {MODES.map((m) => (
          <button key={m.id} className="mode-btn" aria-pressed={m.id === modeId}
            onClick={() => setModeId(m.id)}>{m.name}</button>
        ))}
      </div>
      <div className="goal">{mode.goal}</div>

      <div className="stage">
        <svg viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="160" r={R} fill="none" stroke="var(--line)" strokeWidth="2" />
          <circle cx="160" cy="160" r={R} fill="none" stroke="var(--jade)" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - phaseProg)}
            transform="rotate(-90 160 160)"
            style={{ transition: "stroke-dashoffset .12s linear", opacity: running ? 1 : 0.35 }} />
          {running && <circle cx={ox} cy={oy} r="5" fill="var(--cinnabar)" />}
        </svg>
        <div className="disc" style={{ transform: `scale(${scale})` }} />
        <div className="center">
          {done ? (
            <div className="done">Listo</div>
          ) : (
            <>
              <div className="phase">{phase.label}</div>
              <div className="count">{running ? counter : mode.ratio}</div>
            </>
          )}
        </div>
      </div>

      <div className="controls">
        <button className="play" onClick={toggle}>
          {running ? "Pausá" : done ? "Otra vez" : "Empezá"}
        </button>
        <button className="ghost" onClick={reset} aria-label="Reiniciar sesión">Reiniciar</button>
        <button className="ghost" aria-pressed={sound} onClick={() => setSound((s) => !s)}>
          {sound ? "Son ●" : "Son ○"}
        </button>
      </div>

      <div className="meta">
        <span>Ritmo <b>{mode.ratio}</b></span>
        <span>Restante <b>{fmt(remaining ?? mode.defaultMin * 60)}</b></span>
      </div>
    </div>
  );
}
