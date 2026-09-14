# Breath

Pacer de respiración guiada. React + Vite, instalable como PWA.

Modos: Resonancia, Calma, Dormir, Foco, Energía — cada uno con su propio
ritmo de inhalación/sostén/exhalación y duración de sesión.

## Desarrollo

```bash
npm install
npm run dev          # local
npm run dev:host     # expone en la red local, para probar en el celu
```

## Build

```bash
npm run build
npm run preview
```

## Eventos al OS

La app emite sus sesiones a [joaquin.ai](https://github.com/Khadosh/joaquin.ai) (`/api/events`) para
que el MCP responda "¿cómo me fue con la respiración este mes?" con datos. Sin las variables no emite
nada y la app no cambia.

```bash
cp .env.example .env.local   # VITE_OS_URL + VITE_OS_INGEST_TOKEN (el mismo OS_INGEST_TOKEN del shell)
```

- `session.start` al arrancar de cero (reanudar una pausa no cuenta): `mode`, `planned_s`, `rpm`, `phases`.
- `session.end` con la campanita (`completed: true`), o al reiniciar, cambiar de modo o cerrar la
  app (`completed: false`, `duration_s` real). Pausar no cierra la sesión.
- `session.rate` después de la campanita: una pregunta, un tap (`rating` 1 / 0 / -1). Sin insistir.

El contrato vive en `packages/apps/breath/events.ts` del monorepo; `src/lib/os.js` es la copia en JS.

## Íconos

Los íconos de la PWA se generan desde `scripts/icon.svg` y
`scripts/icon-maskable.svg` con `sharp`:

```bash
npm run icons
```

## Roadmap

- [x] PWA instalable (manifest + service worker vía `vite-plugin-pwa`)
- [x] Persistir modo/sonido elegido (localStorage)
- [x] Audio en segundo plano: beeps agendados en el reloj de WebAudio +
      sesión de audio activa, siguen sonando con la pantalla bloqueada
- [x] Media Session: metadata y play/pausa en el lock screen
- [x] Final suave: últimas respiraciones con fade + campanita
- [ ] App nativa para Apple Watch — en progreso como proyecto de
      aprendizaje de Swift: ver [apple/GUIA-SWIFT.md](apple/GUIA-SWIFT.md)
