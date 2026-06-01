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
## Flujo de tracking
1. Login con DNI + contraseña → Firebase Auth
2. Consulta `/asignaciones` filtrado por `choferId`, fecha actual y
   `activo === true` → obtiene `busId`
3. Solicita permisos: POST_NOTIFICATIONS (API 33+), ACCESS_FINE_LOCATION,
   ACCESS_BACKGROUND_LOCATION
4. Inicia foreground service (`react-native-background-actions`) que
   captura coordenadas vía `watchPosition` y las escribe a
   `/ubicacion_buses/{busId}` con bandera `isActive: true`
5. Al detener: envía `isActive: false` y cierra sesión
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
## Documentación adicional
AGENTS.md — comandos, arquitectura, convenciones y guía para asistentes
automatizados.