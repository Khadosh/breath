# Breath Watch — Guía de aprendizaje Swift/watchOS

De cero a la app de respiración con hápticos en la muñeca, en 7 etapas.
Cada etapa tiene un **objetivo**, los **conceptos** nuevos, un **ejercicio**
y un **checkpoint** verificable. No avances de etapa sin pasar el checkpoint —
cada una construye sobre la anterior.

Regla del juego: el código lo escribís vos. Claude te ayuda con dudas,
review de código y UI/UX, pero no te escribe la solución.

**Recurso de cabecera**: [Hacking with Swift — 100 Days of SwiftUI](https://www.hackingwithswift.com/100/swiftui)
(gratis, es EL curso canónico). No hace falta hacerlo entero: se referencia
lo puntual en cada etapa.

---

## Mapa React → SwiftUI

Tu ventaja injusta: ya pensás declarativo. La traducción mental:

| React | SwiftUI |
|---|---|
| `useState` | `@State` |
| componente (función) | `struct MiVista: View` |
| `render()` / JSX | computed property `body` |
| props | parámetros del init de la struct |
| `useContext` / store | `@Environment`, `@Observable` |
| `useEffect(fn, [])` | `.onAppear { }` / `.task { }` |
| CSS / className | modifiers: `.padding()`, `.foregroundStyle()` |
| `localStorage` | `@AppStorage` |
| re-render al cambiar estado | idéntico: `body` se recalcula solo |

Lo nuevo de verdad: tipado estricto (como TS en `strict`), optionals (`String?`
es un valor que puede no estar y el compilador te obliga a manejarlo), y que
las views son structs (valores inmutables), no funciones con closures.

---

## Etapa 0 — Setup (una tarde)

**Objetivo**: Xcode funcionando con un simulador de Apple Watch.

1. Instalá **Xcode** desde la Mac App Store (~15GB, dejalo bajando).
2. Abrilo, aceptá licencias, dejá que instale los componentes de watchOS.
3. Xcode → Settings → Accounts → agregá tu Apple ID (Personal Team, gratis).
4. Abrí el simulador: Xcode → Open Developer Tool → Simulator → File → Open
   Simulator → watchOS.

**Checkpoint**: ves un Apple Watch virtual en pantalla.

---

## Etapa 1 — Hola mundo en el simulador (una tarde)

**Objetivo**: crear el proyecto y entender qué es cada archivo.

1. File → New → Project → pestaña **watchOS** → **App**. Nombre: `BreathWatch`.
   Interface: SwiftUI. Sin tests por ahora.
2. Mirá los dos archivos generados:
   - `BreathWatchApp.swift` → el `@main`, equivalente a tu `main.jsx`
   - `ContentView.swift` → tu primer componente
3. Corré con ▶ (destino: el simulador de Watch).

**Ejercicio**: convertí el hola mundo en un contador — un `Text` que muestra
un número y un `Button` que lo incrementa. Vas a necesitar `@State`:

```swift
@State private var count = 0
```

(Es tu `useState`. Notá que mutás la variable directo, sin setter —
SwiftUI detecta el cambio porque está marcada `@State`.)

**Checkpoint**: el contador anda en el simulador.
**Si te trabás**: 100 Days of SwiftUI, días 16–18 (proyecto WeSplit).

---

## Etapa 2 — Hola mundo en TU reloj (una tarde)

**Objetivo**: correr en hardware real. Esta etapa es 0% código y 100% pelea
con firmas — es normal, todos pasamos por acá.

1. iPhone conectado por cable a la Mac, Watch apareado al iPhone.
2. En Xcode: seleccioná el target → **Signing & Capabilities** → Team: tu
   Personal Team. Xcode genera el certificado solo.
3. Destino de ejecución: tu Apple Watch (aparece vía el iPhone). Primera vez:
   tarda MUCHO en instalar (minutos). Paciencia.
4. Si el Watch dice "desarrollador no confiable": en el iPhone →
   Ajustes → General → VPN y gestión de dispositivos → confiar.

**Nota**: con cuenta gratis la app expira a los 7 días (re-Run y listo).
Si el proyecto te engancha, los US$99/año lo hacen anual.

**Checkpoint**: tu contador en tu muñeca.

---

## Etapa 3 — El círculo que respira (un par de días)

**Objetivo**: la base visual — un círculo que crece y decrece animado.

**Conceptos**: `ZStack`/`VStack` (flexbox vertical/apilado), `Circle()`,
`.scaleEffect()`, `.animation()` / `withAnimation`, colores y gradientes.

**Ejercicio**: un círculo verde menta sobre fondo oscuro que al tocarlo
alterna entre chico (scale 0.7) y grande (1.0) con animación suave de 3
segundos. Pistas:

```swift
Circle()
    .scaleEffect(inhaling ? 1.0 : 0.7)
    .animation(.easeInOut(duration: 3), value: inhaling)
```

`.onTapGesture { inhaling.toggle() }` — y ya tenés medio pacer.

**Bonus**: probá `.glassBackgroundEffect`, sombras con color
(`.shadow(color: .mint, radius: 20)`) para el glow. Acá arranca la parte
donde me podés pasar screenshots y diseñamos juntos.

**Checkpoint**: círculo animado en el reloj, tocás y respira.
**Referencia**: 100 Days, día 32 (animaciones).

---

## Etapa 4 — Hápticos: conocé tu paleta (una tarde, la más divertida)

**Objetivo**: sentir todos los tipos de vibración y elegir tu vocabulario.

**Concepto**: un solo llamado:

```swift
import WatchKit
WKInterfaceDevice.current().play(.click)
```

**Ejercicio**: una lista con un botón por cada `WKHapticType` (`.click`,
`.directionUp`, `.directionDown`, `.success`, `.failure`, `.retry`,
`.start`, `.stop`, `.notification`) que lo reproduce al tocarlo.
Esto es research de UX con tu propia muñeca: ¿cuál se siente "inhalá"?
¿cuál "exhalá"? ¿cuál es lo bastante sutil para un tick por segundo?

**Nota**: los hápticos NO suenan en el simulador. Esta etapa es en el reloj sí o sí.

**Checkpoint**: tenés decidido qué háptico va para cada fase (anotalo).

---

## Etapa 5 — El motor de fases (el corazón, unos días)

**Objetivo**: el pacer real — modos, timer, cambios de fase con háptico.

**Conceptos**: `struct` para modelos, `Timer`, clases `@Observable`,
`Date`/`TimeInterval`.

**Diseño** (aprendé de nuestra guerra en la web): el motor debe calcular
la fase desde **timestamps absolutos**, nunca acumulando ticks. Guardás
`Date` de inicio del ciclo; en cada tick calculás
`transcurrido = Date().timeIntervalSince(inicio)`, posición en el ciclo
con módulo, y de ahí fase + progreso. Así una pausa del sistema no te
desincroniza jamás (en la web este bug nos costó una iteración entera).

**Estructura sugerida** (nombres, no código):
- `BreathMode`: id, nombre, fases `[(label, segundos, háptico)]`
- `PacerEngine` (@Observable): `start()`, `stop()`, timer interno a 10Hz,
  publica `phaseIndex`, `phaseProgress`, `remaining`
- `ContentView` observa el engine y anima el círculo con `phaseProgress`

Arrancá con dos modos (Resonancia 5.5/5.5 y Calma 4/6) — los otros son
copy-paste de datos después.

**Checkpoint**: elegís modo, el círculo respira al ritmo correcto, y sentís
el háptico en cada cambio de fase — con la pantalla encendida.
**Referencia**: 100 Days, día 62+ (@Observable); busca "Timer SwiftUI".

---

## Etapa 6 — Pantalla apagada: HKWorkoutSession (el jefe final)

**Objetivo**: que siga funcionando con la muñeca baja. ESTE es el motivo
por el que existe la app.

**El concepto**: watchOS congela las apps a los segundos de bajar la muñeca
(igual que el navegador congelaba la PWA — mismo villano, otra plataforma).
La excepción: una **workout session** activa te da runtime continuo y
permiso de reproducir hápticos en background.

**Pasos**:
1. Target → Signing & Capabilities → + Capability → **HealthKit**.
2. Info del target: agregá `NSHealthShareUsageDescription` y
   `NSHealthUpdateUsageDescription` (textos visibles al usuario).
3. Pedí autorización de `HKObjectType.workoutType()` al iniciar.
4. Al arrancar sesión: creá `HKWorkoutSession` con actividad
   `.mindAndBody`, llamá `startActivity(with: Date())`.
   Al terminar: `end()`.

**Trampa conocida**: el delegate (`HKWorkoutSessionDelegate`) es obligatorio
aunque casi no hagas nada en él.

**Checkpoint mágico**: arrancás una sesión, bajás la muñeca, pantalla negra…
y los taps siguen marcando tu respiración. Cuando sientas eso, sacá una
sonrisa y mandame mensaje.

**Referencia**: doc de Apple "Running workout sessions" + WWDC21
"Build a workout app for Apple Watch".

---

## Etapa 7 — Pulido (con Claude de socio de UI/UX)

Ya con todo andando, refinamos juntos:

- Ticks por segundo dentro de cada fase (tu idea original de los pinchacitos)
- Final de sesión: háptico `.success` + resumen
- Duración configurable y persistencia con `@AppStorage`
- Always-On Display: qué mostrar cuando la pantalla está atenuada
- La estética Breath: paleta ink/mint, tipografía, el glow
- (Algún día) sincronizar modos con la PWA

---

## Cómo trabajamos

1. Vos avanzás una etapa y pusheás tu código a este repo (`apple/BreathWatch/`).
2. Claude lo revisa como un code review normal: qué está bien, qué es
   anti-idiomático, qué se rompe en el borde.
3. Las dudas de "¿por qué no compila?" van con el error textual pegado.
4. Para UI/UX: screenshot del reloj + qué te hace ruido, y se diseña juntos.
