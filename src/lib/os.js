// Emisión de eventos al OS (joaquin.ai). Copia en JS plano de `createEmitter` de
// `packages/core/src/events.ts`; el contrato de payloads es `packages/apps/breath/events.ts`.
// Sin VITE_OS_URL o VITE_OS_INGEST_TOKEN no se emite nada y la app se comporta igual.

const OS_URL = import.meta.env.VITE_OS_URL;
const OS_TOKEN = import.meta.env.VITE_OS_INGEST_TOKEN;

function createEmitter({ url, token }) {
  const endpoint = `${url.replace(/\/$/, "")}/api/events`;
  return async function emit(event) {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(event),
        keepalive: true, // sobrevive a pagehide
      });
    } catch {
      // sin red, sin evento. La app sigue.
    }
  };
}

const emit = OS_URL && OS_TOKEN ? createEmitter({ url: OS_URL, token: OS_TOKEN }) : async () => {};

// UUID v4. `crypto.randomUUID` no existe fuera de contextos seguros (p.ej. `dev:host` por http).
export function newSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const app = "breath";
export const osSession = {
  /** { mode, planned_s, rpm, phases: [{ key, secs }] } */
  start: (session_id, payload) => emit({ app, type: "session.start", session_id, payload }),
  /** { mode, planned_s, duration_s, completed, rpm } */
  end: (session_id, payload) => emit({ app, type: "session.end", session_id, payload }),
  /** { rating: 1 | 0 | -1 } — "¿Más tranquilo que al empezar?" */
  rate: (session_id, payload) => emit({ app, type: "session.rate", session_id, payload }),
};
