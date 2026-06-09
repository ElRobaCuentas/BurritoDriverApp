# BurritoDriverApp

Aplicación móvil para choferes del sistema de transporte universitario
"Oficina de Transportes". Emite coordenadas GPS en tiempo real hacia
Firebase Realtime Database.
## Tecnologías
React Native 0.83.1 • TypeScript • Firebase Auth • Firebase RTDB •
react-native-background-actions • @react-native-community/geolocation
## Arquitectura
Sin backend propio. La app se conecta directamente a Firebase RTDB
vía SDK nativo. Autenticación con email `${dni}@burritodriver.com`.
Persistencia offline deshabilitada intencionalmente (evita ráfagas
de posición al reconectar).
## Compatibilidad

La aplicación está preparada para Android 14 (API 34).

El servicio de rastreo utiliza un Foreground Service de tipo `location`.

Requisitos para su funcionamiento:

- android.permission.FOREGROUND_SERVICE_LOCATION
- android:foregroundServiceType="location"
- foregroundServiceType: ['location'] en tiempo de ejecución
## Flujo de tracking
1. Login con DNI + contraseña → Firebase Auth
2. Consulta `/asignaciones` filtrando por `choferId`, fecha actual y
   `activo === true` → obtiene el bus asignado (`busId`)
3. Solicita permisos: POST_NOTIFICATIONS (API 33+), ACCESS_FINE_LOCATION,
   ACCESS_BACKGROUND_LOCATION
4. Inicia Foreground Service (tipo `location`) mediante
   `react-native-background-actions`
5. `watchPosition` comienza a capturar coordenadas GPS
6. Las coordenadas se escriben a `/ubicacion_buses/{busId}` con
   `isActive: true`
7. Al detener: marca `isActive: false`, detiene el servicio y cierra sesión
## Estructura
src/
├── DriverApp.tsx              # Entrypoint, auth gate
├── screen/
│   ├── LoginDriverScreen.tsx  # Login con DNI
│   └── SendCoordinates.tsx    # Tracking, permisos, GPS
└── services/
    └── firebase_service.ts    # Escritura a RTDB
Archivos raíz: index.js, package.json, tsconfig.json, AGENTS.md
## Setup
npm install
npm start          # Metro dev server
npm run android    # Compilar y ejecutar en Android
google-services.json ya incluido en android/app/.
Se requiere dispositivo físico (el emulador no proporciona GPS real
ni foreground services fiables).
iOS no está probado ni soportado activamente.
## Estado actual

1. Login con DNI
2. Asignación automática de bus
3. Rastreo GPS en tiempo real
4. Foreground Service compatible con Android 14
5. Transmisión continua a Firebase incluso con la app en segundo plano

Pendiente:
- Multi-bus
- Geofencing
- Dashboard de flota
- Estadísticas


