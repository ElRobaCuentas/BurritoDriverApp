# BurritoDriverApp — AGENTS.md

## Commands
- `npm start` — Metro dev server
- `npm run android` — build & run on Android
- `npm run ios` — iOS (requires CocoaPods: `bundle exec pod install`)
- `npm run lint` — ESLint (`@react-native` config)
- `npm test` — Jest (react-native preset)
- Format: Prettier 2.8.8 (`arrowParens: avoid, singleQuote: true, trailingComma: all`)

## Architecture
- Entry: `index.js` → `src/DriverApp.tsx`
- Auth-gated: logged-out → `LoginDriverScreen` (Spanish UI), logged-in → `SendCoordinates`
- Login builds email as `${dni}@burritodriver.com`, signs in via Firebase Auth
- `SendCoordinates` queries `/asignaciones` filtered by `choferId` + today's date + `activo === true` to find bus assignment, then writes GPS positions to `/ubicacion_buses/{busId}`
- Background location uses `react-native-background-actions` + `@react-native-community/geolocation`
- Android permissions required: POST_NOTIFICATIONS (API 33+), ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION

## Firebase
- Auth: email/password
- RTDB paths: `/asignaciones` (assignment records), `/ubicacion_buses/{busId}` (live positions)
- Persistence intentionally DISABLED (see comment in `index.js` — real-time tracker, offline queue causes position burst on reconnect)

## Testing
- Single test file: `__tests__/App.test.tsx` — renders `App.tsx` (not `DriverApp.tsx`)
- Run: `npm test`

## Conventions
- Spanish user-facing strings, English code
- All styles inline via `StyleSheet.create`
- Comments in Spanish
