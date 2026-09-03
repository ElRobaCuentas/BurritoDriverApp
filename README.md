# BurritoDriverApp

Aplicación móvil para los conductores del sistema de transporte
universitario "Oficina de Transportes" de la UNMSM. Captura coordenadas
GPS y las transmite en tiempo real a Firebase Realtime Database.

Es una de las aplicaciones del ecosistema con permisos de escritura sobre
los nodos de tracking. Está diseñada para ejecutarse en dispositivos
Android dedicados instalados en los buses.

Además del flujo de conductor (captura y envío de GPS), la DriverApp
incluye un **módulo admin** que permite gestionar conductores, buses y
asignaciones diarias. El acceso admin está restringido a usuarios cuyo
UID existe en `/administradores/` (ADR-017).

## Stack Principal

| Capa | Tecnología |
|------|-----------|
| Framework | React Native 0.83.1 (CLI) |
| Lenguaje | TypeScript |
| Base de datos | Firebase Realtime Database + Auth (23.8.x) |
| Foreground Service | `react-native-background-actions` 4.1.0 |
| Geolocalización | `@react-native-community/geolocation` 3.4.x |

## Requisitos de Plataforma

- **Android 14 (API 34)**: `targetSdkVersion` y `compileSdkVersion`
  configurados en 34.
- **Foreground Service**: el servicio de rastreo utiliza el tipo
  `location`, que debe declararse en tres lugares:
  - `AndroidManifest.xml`: `android:foregroundServiceType="location"`
  - Permisos: `android.permission.FOREGROUND_SERVICE_LOCATION`
  - Tiempo de ejecución: `foregroundServiceType: ['location']`
- **Permisos obligatorios**:
  - `POST_NOTIFICATIONS` (API 33+)
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
- **Min SDK**: 24
- **Dispositivo físico**: el emulador no proporciona GPS real ni
  foreground services fiables.

## Setup

```bash
npm install
```

`google-services.json` ya está incluido en `android/app/`.

No se requiere archivo `.env`. Las credenciales de Firebase se
configuran exclusivamente mediante `google-services.json`.

**iOS no está soportado.** El Foreground Service tipo `location` depende
de APIs nativas de Android que no existen en iOS. Esta app es
Android-only y no está probada en iOS.

## Scripts

| Acción | Comando |
|--------|---------|
| Metro dev server | `npm start` |
| Compilar Android | `npm run android` |
| Tests | `npm test` |
| Lint | `npm run lint` |

## Estructura del Código

```
src/
├── DriverApp.tsx              # Entrypoint, auth gate
├── screen/
│   ├── LoginDriverScreen.tsx  # Login con DNI
│   ├── SendCoordinates.tsx    # Tracking, permisos, GPS, debug console
│   └── admin/                 # Módulo admin (CRUD de flota)
│       ├── ChoferesScreen.tsx
│       ├── BusesScreen.tsx
│       └── AsignacionesScreen.tsx
└── services/
    ├── firebase_service.ts    # Escritura a RTDB (tracking)
    └── admin_service.ts       # CRUD de conductores, buses, asignaciones
```

## Flujo de Tracking

```
Login con DNI
    ↓
Consulta /asignaciones → obtiene busId
    ↓
Solicita permisos Android
    ↓
Inicia Foreground Service (tipo location)
    ↓
watchPosition captura GPS cada ~3s
    ↓
Firebase RTDB (/ubicacion_buses/{busId})
    ↓
UserApp (vía listener propio)
```

Para el detalle del payload y la estructura del nodo de tracking,
consultar `FIREBASE_SCHEMA.md`.

## Módulo admin

Además del tracking, la DriverApp incluye un módulo de administración
accesible para usuarios registrados en `/administradores/`. Funcionalidades
implementadas:

- **Choferes:** crear, listar, activar/desactivar y eliminar conductores.
  Cada creación genera una cuenta Firebase Auth (`{dni}@conductor.com`)
  y el nodo en `/choferes/{dni}`.
- **Buses:** registrar buses con placa, activar/desactivar y eliminar.
  Al crear, se inicializa `/ubicacion_buses/{placa}` con `isActive: false`.
- **Asignaciones diarias:** vincular un conductor con un bus para el día
  actual. Valida que ni el conductor ni el bus tengan otra asignación
  activa hoy. Cancelar desactiva sin eliminar el registro histórico.

> El mismo panel está disponible en versión web en `AdminWeb/`. La
> lógica CRUD es compartida conceptualmente (mismo esquema de RTDB).

## Estado de Implementación

- Login con DNI + contraseña.
- Asignación automática de bus desde `/asignaciones`.
- Rastreo GPS continuo con foreground service.
- Compatibilidad total con Android 14.
- Transmisión ininterrumpida incluso con la app en segundo plano.
- Módulo admin: CRUD de choferes, buses y asignaciones (implementado).

**Pendiente**: geofencing, control de turnos.

## Documentación Relacionada

| Documento | Propósito |
|-----------|-----------|
| `PROJECT_CONTEXT.md` | Visión general del ecosistema. |
| `ARCHITECTURE.md` | Flujo de datos, ciclo de vida del tracking. |
| `FIREBASE_SCHEMA.md` | Estructura de nodos y payloads de la RTDB. |
| `AGENTS.md` | Comandos, convenciones y detalles para asistentes IA. |
| `ROADMAP.md` | Fases, prioridades y tareas pendientes del proyecto. |
| `TROUBLESHOOTING.md` | Guía operativa para diagnosticar problemas conocidos. |
| `DECISIONS.md` | Decisiones de arquitectura (ADR) del ecosistema. |
| `BUGS_RESUELTOS/` | Historial de bugs resueltos durante el desarrollo. |
