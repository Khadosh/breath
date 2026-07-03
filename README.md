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
- [ ] Vibration API en Android/Chrome para pulso háptico por fase
- [ ] Persistir modo/sonido elegido (localStorage)
- [ ] App companion nativa para Apple Watch (Swift + WatchConnectivity) —
      proyecto separado, watchOS no corre contenido web
