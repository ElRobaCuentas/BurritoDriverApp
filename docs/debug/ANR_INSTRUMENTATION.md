# ANR Instrumentation — Checkpoints

Rama: `debug/anr-investigation`

Instrumentación temporal insertada para localizar la instrucción exacta donde el flujo `startProcess()` se bloquea tras presionar INICIAR RECORRIDO.

---

## Checkpoint 1 — SendCoordinates.tsx / startProcess()

**Archivo:** `src/screen/SendCoordinates.tsx:185-218`

```typescript
console.log("[ANR] 0 startProcess called");
console.log("[ANR] 1 checking permissions...");
console.log("[ANR] 2 permissions result:", permisosOk);
console.log("[ANR] 3 calling BackgroundJob.start()...");
console.log("[ANR] 4 BackgroundJob.start() returned");
console.log("[ANR] 5 setIsSending done");
console.log("[ANR] X startProcess CRASHED:", e.message);
```

| Log | Respuesta |
|-----|-----------|
| 0 | ¿Se ejecutó `startProcess()`? |
| 1→2 | ¿Las 3 solicitudes de permiso completaron? |
| 3→4 | ¿`BackgroundJob.start()` retornó o se bloqueó? |
| 5 | ¿El estado `isSending` se actualizó? |
| X | ¿Hubo excepción capturada en el catch? |

---

## Checkpoint 2 — BackgroundServer.start()

**Archivo:** `node_modules/react-native-background-actions/src/index.js:78-95`

```javascript
console.log("[ANR] A BackgroundServer.start entered");
console.log("[ANR] A1 headless task registered");
console.log("[ANR] B calling RNBackgroundActions.start()...");
console.log("[ANR] C RNBackgroundActions.start() returned");
```

| Log | Respuesta |
|-----|-----------|
| A | ¿`BackgroundServer.start()` fue invocado? |
| A1 | ¿El headless task se registró en `AppRegistry`? |
| B→C | ¿El bridge nativo `RNBackgroundActions.start()` retornó? |

---

## Checkpoint 3 — BackgroundActionsModule.start()

**Archivo:** `node_modules/react-native-background-actions/android/src/main/java/com/asterinet/react/bgactions/BackgroundActionsModule.java:40-64`

```java
Log.d("ANR_TRACE", "D BackgroundActionsModule.start() entered");
Log.d("ANR_TRACE", "E Intent created");
Log.d("ANR_TRACE", "F BackgroundTaskOptions constructed");
Log.d("ANR_TRACE", "G startForegroundService() returned");
Log.d("ANR_TRACE", "H promise resolving");
```

| Log | Respuesta |
|-----|-----------|
| D | ¿El `@ReactMethod start()` fue invocado desde JS? |
| E | ¿Se creó el `Intent` para el servicio? |
| F | ¿`BackgroundTaskOptions` se construyó sin excepción? |
| G | ¿`startForegroundService()` retornó? |
| H | ¿`promise.resolve()` está por ejecutarse? |

Nota: Corre en el **native module thread** (no main thread).

---

## Checkpoint 4 — RNBackgroundActionsTask.onStartCommand()

**Archivo:** `node_modules/react-native-background-actions/android/src/main/java/com/asterinet/react/bgactions/RNBackgroundActionsTask.java:86-125`

```java
Log.d("ANR_TRACE", "I onStartCommand entered, pid=" + android.os.Process.myPid());
Log.d("ANR_TRACE", "J BackgroundTaskOptions reconstructed");
Log.d("ANR_TRACE", "J1 notification channel created");
Log.d("ANR_TRACE", "K about to call startForeground()");
Log.d("ANR_TRACE", "K1 startForeground() succeeded");
Log.d("ANR_TRACE", "K2 startForeground() FAILED: " + e.getMessage());
Log.d("ANR_TRACE", "L onStartCommand returning");
```

| Log | Respuesta |
|-----|-----------|
| I | ¿El servicio se creó? Incluye PID del proceso separado. |
| J | ¿`BackgroundTaskOptions` se reconstruyó sin error? |
| J1 | ¿Canal de notificación creado? |
| K | Punto justo antes de `startForeground()`. |
| K1 | `startForeground()` exitoso. |
| K2 | `startForeground()` falló (crash `InvalidForegroundServiceTypeException`). |
| L | `onStartCommand` retornando — servicio arrancó. |

Nota: Corre en **proceso separado** (PID del servicio, ej. 7840), no en el proceso principal.

---

## Checkpoint 5 — locationTask (headless JS task)

**Archivo:** `src/screen/SendCoordinates.tsx:26-76`

```typescript
console.log("[ANR] M locationTask started, params:", JSON.stringify(taskDataArguments));
console.log("[ANR] N calling watchPosition...");
console.log("[ANR] O watchPosition returned, id:", watchId);
console.log("[ANR] P watchPosition callback: lat=", latitude, "lng=", longitude);
```

| Log | Respuesta |
|-----|-----------|
| M | ¿El headless task (`locationTask`) se ejecutó? |
| N | ¿Se está por llamar a `Geolocation.watchPosition()`? |
| O | ¿`watchPosition()` retornó un ID? |
| P | ¿El callback de GPS se disparó con posición válida? |

Nota: Corre en el contexto del headless task (posiblemente proceso separado o ReactContext aislado).

---

## Línea de tiempo esperada en logcat

Filtrar: `adb logcat -s "ANR_TRACE"` y `adb logcat -s "ANR"`

```
[ANR] 0 startProcess called
[ANR] 1 checking permissions...
[ANR] 2 permissions result: true
[ANR] 3 calling BackgroundJob.start()...
[ANR] A BackgroundServer.start entered
[ANR] A1 headless task registered
[ANR] B calling RNBackgroundActions.start()...
D ANR_TRACE: D BackgroundActionsModule.start() entered
D ANR_TRACE: E Intent created
D ANR_TRACE: F BackgroundTaskOptions constructed
D ANR_TRACE: G startForegroundService() returned
D ANR_TRACE: H promise resolving
[ANR] C RNBackgroundActions.start() returned
[ANR] 4 BackgroundJob.start() returned
[ANR] 5 setIsSending done
(63s gap — main thread bloqueado / VRI warnings)
D ANR_TRACE: I onStartCommand entered, pid=7840
D ANR_TRACE: J BackgroundTaskOptions reconstructed
D ANR_TRACE: J1 notification channel created
D ANR_TRACE: K about to call startForeground()
D ANR_TRACE: K1 startForeground() succeeded  |  K2 FAILED
D ANR_TRACE: L onStartCommand returning
[ANR] M locationTask started, params: {...}
[ANR] N calling watchPosition...
[ANR] O watchPosition returned, id: 1000
[ANR] P watchPosition callback: lat=..., lng=...
```

## Reglas

- Solo instrumentación temporal. No mezclar refactors ni correcciones.
- Los cambios en `node_modules/` se perderán con `npm install` — son descartables.
- Al resolver el ANR: eliminar todos estos logs, verificar diff limpio vs `main`, mergear solo cambios funcionales.
