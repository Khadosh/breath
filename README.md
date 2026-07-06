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
