# BurritoDriverApp — AGENTS.md

## 1. Propósito

Este archivo está dirigido **exclusivamente a asistentes de IA** (OpenCode,
Gemini CLI, Claude Code, Cursor, etc.). NO es un README. README.md explica
qué hace el proyecto. AGENTS.md explica **cómo trabajar sin romperlo**.

### Filosofía

Esta app es un **productor de GPS Android**. Su única función es capturar
coordenadas y escribirlas en Firebase RTDB. Un error silencioso aquí no
produce un crash: el bus simplemente desaparece del mapa de los estudiantes.

Ante la duda: modificar menos, preguntar antes de asumir, mantener el
ciclo de tracking intacto, no hacer refactors no solicitados.

---

## 2. Flujo obligatorio de trabajo

1. **Entender la tarea** — Identifica qué parte toca.
2. **Identificar archivos afectados** — Usa la tabla de sección 8.
3. **Leer documentación relacionada** — Referencias al final.
4. **Modificar solo lo necesario** — Sin refactors ni expansión.
5. **Sincronizar documentación** — Si >1 documento impactado,
   actualiza todos antes de cerrar.
6. **Ejecutar verificaciones** — Checklist de sección 9.
7. **Entregar resultado** — Confirma compilación y tracking.

---

## 3. Comandos

| Acción | Comando |
|--------|---------|
| Instalar dependencias | `npm install` |
| Iniciar Metro | `npm start` |
| Compilar Android | `npm run android` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Logs Android | `adb logcat \| grep RNBackground` |
| Formatear | `npx prettier --write <file>` |

Prettier: `singleQuote`, `arrowParens: 'avoid'`, `trailingComma: 'all'`.
No hay script para typecheck. No hay `.env`.

---

## 4. Arquitectura mínima

```
index.js → DriverApp.tsx
         → LoginDriverScreen (sin sesión) o SendCoordinates (con sesión)
```

| Archivo | Rol |
|---------|-----|
| `DriverApp.tsx` | Auth gate |
| `LoginDriverScreen.tsx` | Login con DNI |
| `SendCoordinates.tsx` | **Crítico**: tracking, permisos, GPS, debug |
| `firebase_service.ts` | Escritura RTDB |

La app consulta `/asignaciones` y escribe en `/ubicacion_buses/{busId}`.
Para detalles: ARCHITECTURE.md y FIREBASE_SCHEMA.md.

---

## 5. Ciclo de vida del tracking

```
Login → fetchAssignment → startProcess → permisos Android
    → BackgroundJob.start → locationTask (watchPosition)
    → updateBusLocation → stopProcess → isActive=false → signOut
```

Notas:
- DETENER TODO es la única fuente de verdad para `isActive: false`.
- `locationTask` corre fuera de React. Errores allí son silenciosos.
- `stopProcess` usa `import()` dinámico para hacer signOut.

Para implementación detallada: ARCHITECTURE.md sección 8.

---

## 6. Reglas críticas

### 6.1 No expandir alcance

Resuelve exactamente lo solicitado. Sin refactors no pedidos.

### 6.2 Incertidumbre → preguntar

Si no puedes determinar la intención, pregunta. No asumas.

### 6.3 Sincronización documental obligatoria

Si el cambio impacta >1 documento, actualiza todos antes de cerrar.

### 6.4 Foreground Service en 3 lugares

Requiere `foregroundServiceType="location"` en AndroidManifest,
permisos y opciones JS. Si falta uno, Android 14 crashea en runtime.

### 6.5 No reactivar persistence

Decisión documentada en DECISIONS.md (ADR-003). Con persistencia
activa, Firebase reenvía ubicaciones viejas en ráfaga al reconectar.

### 6.6 No modificar `locationTask` sin entender el ciclo

Corre dentro del BackgroundJob. Errores allí dejan el tracking
inoperativo sin aviso en la UI. Leer ARCHITECTURE.md sección 8 antes.

### 6.7 No cambiar orden de permisos

Secuencia estricta: POST_NOTIFICATIONS → FINE → BACKGROUND. Cada
uno con early return. Cambiar el orden puede omitir un permiso.

### 6.8 No modificar configuración GPS sin justificación

Valores actuales: `interval: 3000`, `enableHighAccuracy: true`.
Impacta batería, precisión y frecuencia de actualización.

### 6.9 No eliminar validación de `busId`

Sin ella, el servicio arranca sin bus asignado y escribe a
`/ubicacion_buses/null`.

### 6.10 No cambiar `import()` dinámico en `stopProcess`

Es deliberado. No cambiarlo a import estático.

### 6.11 No eliminar `keepAlive`

Vigila que el BackgroundJob siga corriendo y limpia recursos si no.

### 6.12 No agregar cola de reintentos

Sin persistence, el siguiente pulso (3s) reemplaza la posición
fallida. Agregar cola reintroduce el problema de ráfaga.

### 6.13 No confiar en cierre limpio

No hay `onDisconnect`. DETENER TODO es la única fuente de verdad
para `isActive: false`.

### 6.14 No modificar `stopWithTask`

`stopWithTask="false"` evita que Android mate el foreground service
al cerrar la app sin escribir `isActive: false`.

### 6.15 No eliminar comentarios `// T11:`

Son marcadores de refactors anteriores en `SendCoordinates.tsx`.
Ayudan a rastrear el historial de cambios en líneas críticas.

---

## 7. Convenciones

| Ámbito | Regla |
|--------|-------|
| UI strings | Español |
| Código | Inglés |
| Variables | camelCase |
| Componentes | PascalCase |
| Comentarios | Español |
| Documentación | Español |
| Estilos | `StyleSheet.create` |
| Commits | Conventional Commits |

---

## 8. Actualización de documentación

| Si cambias... | Actualiza... |
|---------------|-------------|
| Path de RTDB | `docs/FIREBASE_SCHEMA.md` |
| Flujo de datos | `docs/ARCHITECTURE.md` |
| Decisión arquitectónica | `docs/DECISIONS.md` |
| Bug en diagnóstico | `docs/TROUBLESHOOTING.md` |
| Bug corregido | `docs/BUGS_RESUELTOS/` |
| Limitación | `docs/PROJECT_CONTEXT.md` |
| Prioridades | `docs/ROADMAP.md` |
| Regla IA | `AGENTS.md` |
| Revisión futura | `docs/ReviewNotes.md` |
| Setup | `README.md` |

---

## 9. Checklist pre-entrega

- [ ] `npm run lint` sin errores.
- [ ] Sin `console.log` temporales.
- [ ] Ciclo de tracking intacto (login → start → stop → logout).
- [ ] Foreground Service consistente en los 3 lugares si se modificó.
- [ ] Documentación sincronizada (todos los docs afectados).
- [ ] ReviewNotes actualizadas si aplica.

**Nota:** `__tests__/App.test.tsx` es heredado y falla. No corregirlo
salvo que la tarea lo solicite.

---

## Referencias

| Si necesitas... | Lee... |
|----------------|--------|
| Propósito del sistema | `docs/PROJECT_CONTEXT.md` |
| Flujo detallado | `docs/ARCHITECTURE.md` |
| Estructura RTDB | `docs/FIREBASE_SCHEMA.md` |
| Próximas fases | `docs/ROADMAP.md` |
| Bugs conocidos | `docs/TROUBLESHOOTING.md` |
| Decisiones | `docs/DECISIONS.md` |
| Revisión futura | `docs/ReviewNotes.md` |
| Historial de bugs resueltos | `docs/BUGS_RESUELTOS/` |
| Setup | `README.md` |
