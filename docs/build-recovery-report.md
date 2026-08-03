# Build Recovery Report

> Documento oficial del incidente de compilación del APK Release.

**Documento**: Build Recovery Report  
**Proyecto**: BurritoDriverApp  
**Fecha**: Julio 2026  
**Estado**: Cerrado (con deuda técnica documentada)  
**Alcance**: Investigación, diagnóstico, corrección y documentación del incidente de compilación que impedía generar el APK Release

---

## 1. Contexto

### Proyecto afectado

- **Nombre**: BurritoDriverApp
- **Ruta**: `C:\ProyectosMovil\BurritoDriverApp`
- **Rama**: `pruebas-bateria-datos`
- **React Native**: 0.83.1
- **React**: 19.2.0
- **Arquitectura**: Legacy (`newArchEnabled=false`)
- **Objetivo inicial**: Generar APK Release (`gradlew assembleRelease`)

### Proyecto no afectado

- **Nombre**: BurritoUserApp (`C:\ProyectosMovil\BurritoUserApp`)
- **Motivo**: usa `react-native-maps` en lugar de `@react-native-community/geolocation`, y `react-native-gesture-handler@2.30.0` (no genera rutas de compilación que excedan 260 caracteres)

### Copia temporal creada durante el incidente

- **Ruta**: `C:\BD`
- **Propósito**: Evitar el límite de 260 caracteres del NDK de Windows
- **Estado**: Copia física con `.git` propio, mismo HEAD que el original

### Estructura relevante de `C:\ProyectosMovil`

```
C:\ProyectosMovil\
├── BurritoDriverApp/        ← Proyecto afectado (este reporte)
├── BurritoUserApp/          ← No afectado
├── docs/                    ← Documentación general del ecosistema
├── .opencode/               ← Configuración de OpenCode
├── Documentación_Oficial.docx
├── FLUJO_DE_TRABAJO.md
├── IDEAS.txt
├── PLAN_MIGRACION_DRIVER_APP.txt
└── TAREAS.txt
```

### Estado inicial del proyecto antes de la investigación

- Según el contexto de la investigación, el proyecto había generado APKs anteriormente. Este hecho no puede verificarse únicamente desde el repositorio.
- Se intentó generar `gradlew assembleRelease` y falló con el error descrito en la sección 2.
- No se había modificado código de la aplicación (`src/`) recientemente.
- Se reportaron limpiezas de caché (`Remove-Item .cxx, build, node_modules/.cache`) sin éxito.

---

## 2. Síntomas observados

### 2.1 Error principal: Codegen fantasma de geolocation

**Comando**: `gradlew assembleRelease`

**Error en consola**:
```
Task :app:configureCMakeRelWithDebInfo FAILED

CMake Error at android/app/build/generated/autolinking/src/main/jni/Android-autolinking.cmake:
  add_subdirectory given source
  C:/BD/node_modules/@react-native-community/geolocation/
    android/build/generated/source/codegen/jni/
  which is not an existing directory.

Cannot specify link libraries for target
  react_codegen_RNCGeolocationSpec
which is not built by this project.
```

**Interpretación**: CMake intenta incluir un subdirectorio de código generado (codegen) para la librería `@react-native-community/geolocation`, pero ese directorio nunca es creado por la librería porque el proyecto no usa la New Architecture.

### 2.2 Error secundario: Path Too Long (NDK de Windows)

**Error en consola** (al intentar compilar desde `C:\ProyectosMovil\BurritoDriverApp`):
```
ninja: error: ... RNGestureHandlerDetectorShadowNode.cpp.o:
  Filename longer than 260 characters
```

**Interpretación**: El NDK de Android (ninja/clang) usa APIs de Windows con límite `MAX_PATH=260`. Al compilar `react-native-gesture-handler@3.0.2`, CMake genera rutas de archivos `.o` que exceden ese límite.

### 2.3 Error terciario: Dependencia JS no instalada

**Error en consola** (al llegar a `createBundleReleaseJsAndAssets`):
```
Metro: Cannot find module '@react-navigation/native-stack' (mensaje aproximado, no verificado desde el repositorio)
```

**Interpretación**: `@react-navigation/native-stack` estaba declarado en `package.json` pero no instalado en `node_modules`. Hipótesis: instalación incompleta o copia truncada al crear `C:\BD`.

### 2.4 Error por daño colateral durante la edición manual

**Error en consola**:
```
package com.facebook.react.bridge does not exist
... (30+ errores similares)
```

**Interpretación**: Durante la edición manual del `build.gradle` de geolocation para eliminar el bloque `react { libraryName }`, se borró accidentalmente el bloque `dependencies { ... }` completo, dejando a la librería sin acceso a las clases de React Native.

---

## 3. Línea de tiempo

### Fase 1: Diagnóstico inicial

1. Se ejecutó `gradlew assembleRelease` desde `C:\ProyectosMovil\BurritoDriverApp`.
2. Falló con el error de `add_subdirectory` para geolocation (sección 2.1).
3. Se copió el proyecto a `C:\BD` para evitar problemas de ruta larga.
4. Se realizaron limpiezas completas de `build/`, `.cxx/` y `node_modules/.cache`.
5. **Hipótesis inicial**: rutas cacheadas de Gradle/CMake apuntando a la ubicación anterior (`C:\ProyectosMovil\BurritoDriverApp`). Descartada tras limpieza completa sin éxito.

### Fase 2: Investigación del Codegen

1. Se inspeccionó el `Android-autolinking.cmake` generado por RN.
2. Se descubrió que contenía `add_subdirectory(...geolocation/.../codegen/jni)`.
3. Se verificó que el directorio `build/generated/source/codegen/jni/` **no existe** dentro de geolocation.
4. Se inspeccionó el `package.json` de geolocation: contenía `codegenConfig`.
5. **Descubrimiento clave**: El `build.gradle` de geolocation contiene `libraryName = "RNCGeolocation"` dentro de un bloque `if (isNewArchitectureEnabled()) { react { ... } }`.
6. Se eliminó manualmente `codegenConfig` del `package.json` y el bloque `react {}` del `build.gradle` de geolocation.

### Fase 3: Daño colateral

1. La edición manual del `build.gradle` eliminó accidentalmente el bloque `dependencies {}`.
2. Al compilar, la librería no encontraba las clases de React Native → 30+ errores de compilación Java.

### Fase 4: Instalación de dependencia faltante

1. Se detectó que `@react-navigation/native-stack` no estaba instalado en `node_modules`.
2. Se ejecutó `npm install` para instalarlo.

### Fase 5: Build exitoso

1. Se restauró el bloque `dependencies {}` de geolocation (desde el proyecto original intacto).
2. Se ejecutó `gradlew assembleRelease` desde `C:\BD`.
3. **BUILD SUCCESSFUL**. APK generado en `C:\BD\android\app\build\outputs\apk\release\app-release.apk`.

### Fase 6: Investigación del autolinking

1. Se ejecutó `npx react-native config` y se inspeccionó el `autolinking.json`.
2. Se descubrió que **aún sin `codegenConfig`** en el `package.json`, el CLI seguía reportando `libraryName: "RNCGeolocation"` y `cmakeListsPath`.
3. Se localizó el código fuente en `node_modules/@react-native-community/cli-config-android/.../findLibraryName.js`.

**Hallazgo definitivo**: `findLibraryName.js` tiene dos fuentes:
   - **Primera fuente**: `codegenConfig.name` del `package.json` (ya eliminado).
   - **Segunda fuente (fallback)**: un **regex de texto bruto** sobre el `android/build.gradle`: `/libraryName = ["'](.+)["']/`. Este regex **no evalúa condicionales** (`if`). Encuentra `libraryName = "RNCGeolocation"` aunque esté dentro de código muerto (`if (isNewArchitectureEnabled())`).

4. Se verificó que `GenerateAutolinkingNewArchitecturesFileTask.kt` del Gradle Plugin emite `add_subdirectory` si `libraryName != null && cmakeListsPath != null`. `cmakeListsPath` siempre tiene un valor por defecto; el único interruptor real es `libraryName`.

### Fase 7: Creación del workaround permanente

1. Se creó `scripts/fix-geolocation-codegen.js`.
2. Se agregó `"postinstall": "node scripts/fix-geolocation-codegen.js"` en `package.json`.
3. El script elimina `codegenConfig` del `package.json` y el bloque `react { libraryName }` del `build.gradle` de geolocation en cada `npm install`.

### Fase 8: Intento de compilación desde el proyecto original

1. Se intentó compilar desde `C:\ProyectosMovil\BurritoDriverApp`.
2. Falló con el error de "Filename longer than 260 characters" (sección 2.2).
3. **Conclusión**: El NDK de Windows no puede compilar gesture-handler 3.x desde una ruta de proyecto larga.

---

## 4. Causa raíz

### 4.1 Geolocation + Autolinking de RN 0.83

#### El mecanismo interno

React Native 0.83.1 introdujo cambios en `@react-native/gradle-plugin` que afectan cómo se genera el archivo `Android-autolinking.cmake`:

1. **`GenerateAutolinkingNewArchitecturesFileTask.kt`** genera `add_subdirectory` para cada dependencia en el `autolinking.json` que tenga `libraryName != null && cmakeListsPath != null`. **No existe ningún chequeo de `newArchEnabled`** en esta tarea.

2. **El `autolinking.json`** es generado por `npx @react-native-community/cli config`, que ejecuta `findLibraryName.js`.

3. **`findLibraryName.js`** (en `@react-native-community/cli-config-android`) determina el `libraryName` en dos pasos:
   ```
   libraryName = userConfig.libraryName
                 || findLibraryName(root, sourceDir);

   function findLibraryName(root, sourceDir):
       // 1º: busca codegenConfig.name en package.json
       // 2º: fallback con regex textual sobre build.gradle:
       match = buildGradleContents.match(/libraryName = ["'](.+)["']/);
   ```

4. El `android/build.gradle` de `@react-native-community/geolocation@3.4.0` contiene:
   ```groovy
   if (isNewArchitectureEnabled()) {
     react {
       libraryName = "RNCGeolocation"
       codegenJavaPackageName = "com.reactnativecommunity.geolocation"
     }
   }
   ```
   El regex `/libraryName = ["'](.+)["']/` **no evalúa el `if`**. Solo busca el texto `libraryName = "RNCGeolocation"` en el archivo y lo encuentra.

5. El `ReactRootProjectPlugin.kt` de RN 0.83 **fuerza `newArchEnabled=true` en todos los subproyectos**, pero la librería `geolocation` chequea `rootProject.getProperty("newArchEnabled")` (no `subproject`). Geolocation consulta una propiedad (`newArchEnabled` a nivel de rootProject) mientras que el plugin fuerza el valor en los subproyectos — este desajuste permite que el bloque `react { libraryName }` permanezca como código muerto detectable por el regex.

#### La cadena de fallo completa

```
newArchEnabled=false (en gradle.properties)
  → geolocation NO ejecuta el bloque react { libraryName } (correcto)
  → geolocation usa src/legacy/ (correcto)
  → geolocation NO genera build/generated/source/codegen/jni/ (correcto)
  → Pero el CLI ejecuta findLibraryName.js que detecta "RNCGeolocation" por regex
  → autolinking.json contiene libraryName: "RNCGeolocation"
  → GenerateAutolinkingNewArchitecturesFileTask emite:
        add_subdirectory(".../codegen/jni/" RNCGeolocationSpec_autolinked_build)
  → CMake busca ".../geolocation/android/build/generated/source/codegen/jni/"
  → El directorio NO EXISTE (nunca se creó)
  → CMake ABORTA con error
  → error: Cannot specify link libraries for target react_codegen_RNCGeolocationSpec
```

### 4.2 Path Too Long (NDK de Windows)

#### Cómo CMake genera los archivos .o

CMake genera archivos objeto (`.o`) usando la siguiente estructura de directorios:

```
<build_dir>/CMakeFiles/<target>.dir/
  <ruta_absoluta_del_fuente_con_:reemplazados_por_/>/
  <nombre_archivo>.cpp.o
```

Cuando el archivo fuente está **fuera del directorio del `CMakeLists.txt`** (como en gesture-handler 3.x), CMake replica la ruta absoluta completa.

#### Por qué gesture-handler 3.x expone el problema

En `react-native-gesture-handler@2.x`, todo el código C++ está dentro de `android/src/main/jni/`. CMake calcula rutas relativas cortas para los `.o`.

En `react-native-gesture-handler@3.x`, los ShadowNodes de Fabric se movieron a `shared/shadowNodes/react/renderer/components/rngesturehandler_codegen/`, **fuera** del directorio `android/`. Al estar fuera del directorio del `CMakeLists.txt`, CMake espeja la ruta absoluta completa del fuente.

#### Ruta exacta del archivo que falla

```
C:\ProyectosMovil\BurritoDriverApp\android\app\.cxx\
  RelWithDebInfo\3j54716a\arm64-v8a\
  rngesturehandler_codegen_autolinked_build\
  CMakeFiles\react_codegen_rngesturehandler_codegen.dir\
  C_\ProyectosMovil\BurritoDriverApp\node_modules\
  react-native-gesture-handler\shared\shadowNodes\react\renderer\
  components\rngesturehandler_codegen\
  RNGestureHandlerDetectorShadowNode.cpp.o
```

Longitud: ~362 caracteres. El límite de Windows (`MAX_PATH`) es 260.

#### Por qué LongPathsEnabled no ayuda

Windows 10/11 tienen `LongPathsEnabled=1` que permite rutas de hasta 32767 caracteres en la mayoría de las APIs. Sin embargo, el NDK de Android (clang, ninja, y las toolchains de CMake) usan **llamadas ANSI antiguas** (`CreateFileA`, `_open`, etc.) que **ignoran esta configuración**. El límite sigue siendo 260 para estas herramientas.

#### Por qué C:\BD solucionó el problema

La ruta `C:\BD\...` tiene solo **5 caracteres** de prefijo, contra los **39 caracteres** de `C:\ProyectosMovil\BurritoDriverApp\...`. Esa diferencia de 34 caracteres fue suficiente para que la ruta del `.o` quedara por debajo de 260.

---

## 5. Cambios realizados

### 5.1 Cambios permanentes (deben mantenerse)

| Archivo | Cambio | Justificación |
|---------|--------|---------------|
| `package.json` | Agregado `"postinstall": "node scripts/fix-geolocation-codegen.js"` | Ejecuta el fix automáticamente en cada `npm install` |
| `scripts/fix-geolocation-codegen.js` | Archivo nuevo | Parchea geolocation en postinstall |
| `android/gradle.properties` | `newArchEnabled=true` → `false` | Restaura la arquitectura legacy que el proyecto siempre usó |
| `docs/build-recovery-report.md` | Archivo nuevo (este documento) | Referencia oficial del incidente |

### 5.2 Cambios temporales (en node_modules, se regeneran con npm install + postinstall)

| Archivo | Cambio | Se aplica vía |
|---------|--------|---------------|
| `node_modules/@react-native-community/geolocation/package.json` | Eliminado `codegenConfig` | `fix-geolocation-codegen.js` |
| `node_modules/@react-native-community/geolocation/android/build.gradle` | Eliminado bloque `react { libraryName = "RNCGeolocation" }` | `fix-geolocation-codegen.js` |

### 5.3 Cambios en node_modules (restaurados)

| Archivo | Cambio | Detalle |
|---------|--------|---------|
| `node_modules/@react-native-community/geolocation/android/build.gradle` | Se restauró el bloque `dependencies {}` | Fue eliminado accidentalmente durante una edición manual; restaurado desde el proyecto original intacto |

### 5.4 Cambios descartados

| Intento | Motivo del descarte |
|---------|---------------------|
| `react-native.config.js` para excluir geolocation del codegen | El CLI de RN 0.83 no expone overrides para `libraryName`/`cmakeListsPath` a nivel de dependencia individual |
| `patch-package` para persistir el fix | Falló por rutas largas (`Filename too long`) en Windows; `postinstall` es más robusto |
| Bajar `react-native-gesture-handler` a 2.x | Riesgo de breaking changes en una app funcional; el fix de ruta corta ya resuelve el problema |
| Activar `newArchEnabled=true` | Inviable sin verificar la compatibilidad de todas las dependencias con New Architecture |

### 5.5 Archivos creados

| Archivo | Propósito |
|---------|-----------|
| `scripts/fix-geolocation-codegen.js` | Script postinstall que parchea geolocation |
| `docs/build-recovery-report.md` | Este documento |

### 5.6 Archivos que deberían eliminarse

| Archivo | Ubicación | Por qué |
|---------|-----------|---------|
| `rnconfig.json` | `C:\BD\` | Dump de `npx react-native config` (~57 KB), generado durante diagnóstico |
| `rnconfig2.json` | `C:\BD\` | Dump de `npx react-native config` post-fix (~57 KB), generado durante diagnóstico |
| `estructura.txt` | `C:\ProyectosMovil\BurritoDriverApp\` | Nota antigua, no forma parte del proyecto |
| `estructura_driver_src_REAL.txt` | `C:\ProyectosMovil\BurritoDriverApp\` | Nota antigua, no forma parte del proyecto |
| `patches/` (si existe) | `C:\ProyectosMovil\BurritoDriverApp\` | Intento fallido de patch-package |

---

## 6. Estado actual del proyecto

### Qué quedó funcionando

- ✅ **APK Release generado** en `C:\BD\android\app\build\outputs\apk\release\app-release.apk`
- ✅ **Compilación desde C:\BD** (ruta corta) funciona correctamente
- ✅ **Geolocation** funciona como módulo legacy (sin cambios en runtime)
- ✅ **`@react-navigation/native-stack`** instalado
- ✅ **Fix del codegen fantasma** aplicado vía postinstall (en ambos `C:\BD` y `C:\ProyectosMovil\BurritoDriverApp`)
- ✅ **Código fuente (`src/`)** intacto, sin modificaciones

### Deuda técnica existente

| Deuda | Detalle | Impacto |
|-------|---------|---------|
| Script postinstall modificando `node_modules` | No es una práctica recomendada, pero es la única solución viable actualmente | Bajo (es idempotente y reversible) |
| Dependencia de ruta corta para builds Release en Windows | El NDK no respeta `LongPathsEnabled` | Medio (solo afecta Windows, no Linux/Mac/CI) |
| Documentación referenciada en AGENTS.md que no existe | 8 documentos (`ARCHITECTURE.md`, etc.) están en `C:\ProyectosMovil\docs\`, no dentro del proyecto | Bajo (son referencias cruzadas) |
| `@react-native/new-app-screen` como dependencia no utilizada | Viene de la plantilla de RN, no se importa en ningún lado | Muy bajo |

### Riesgos pendientes

| Riesgo | Descripción | Probabilidad |
|--------|-------------|-------------|
| **Migración a New Architecture** | Si se activa `newArchEnabled=true`, el script postinstall eliminará el `codegenConfig` que geolocation NECESITA para funcionar con New Architecture | Baja (decisión planificada) |
| **Actualización de geolocation** | Si `@react-native-community/geolocation` sube a 3.5.0+ y cambia la estructura del `build.gradle`, el script será no-op (no rompe, pero no se sabe si el bug persiste) | Baja |
| **Reinstalación de node_modules** | El postinstall se ejecuta automáticamente; si el script falla silenciosamente, el error del build reaparecería | Muy baja (script probado) |
| **Cambio de máquina/CI** | En otra máquina Windows, el problema de ruta larga seguiría existiendo; en Linux/Mac no | Media |

### Por qué el proyecto sigue usando Legacy Architecture

- `newArchEnabled=false` fue el estado original del proyecto durante meses de funcionamiento correcto.
- RN 0.83 permite Legacy Architecture sin problemas; la New Architecture es optativa.
- Activar `newArchEnabled=true` requeriría verificar TODAS las dependencias: `react-native-firebase/*`, `react-native-background-actions`, `react-native-gesture-handler`, etc.
- No hay un beneficio inmediato que justifique la migración en este momento.

---

## 7. Decisiones técnicas

### Decisión 1: Mantener `newArchEnabled=false`

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | El proyecto siempre funcionó con Legacy Architecture. La New Architecture de RN 0.83 no es obligatoria. |
| **Ventajas** | Sin impacto en runtime. Sin riesgo de incompatibilidad con dependencias. Sin necesidad de migración. |
| **Desventajas** | El bug del autolinking de RN 0.83 solo afecta a proyectos con `newArchEnabled=false`, por lo que el workaround es necesario. |

### Decisión 2: Aceptar el postinstall como workaround

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | Es la única solución viable que no requiere parchar el CLI de RN ni la librería geolocation. La alternativa (`react-native.config.js`) no es soportada por el CLI. |
| **Ventajas** | Automático, idempotente, reversible, sin cambios en el código de la app. |
| **Desventajas** | Modifica `node_modules` (práctica no ideal). Depende de la estructura actual de geolocation. |

### Decisión 3: No bajar `react-native-gesture-handler` a 2.x

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | El problema de rutas largas ya está resuelto con la ruta corta (C:\BD). Bajar la versión mayor de gesture-handler podría introducir breaking changes en la UI. |
| **Ventajas** | Sin riesgo para la app existente. El fix de ruta corta no tiene impacto en runtime. |
| **Desventajas** | Dependencia de `C:\BD` (o un junction) para builds Release en Windows. |

### Decisión 4: Mantener geolocation 3.4.0

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | La versión 3.4.0 es la última publicada. El bug no es de la librería sino del autolinking de RN 0.83. |
| **Ventajas** | No hay versión superior que pueda corregir el problema. |
| **Desventajas** | Ninguna (no hay alternativa). |

### Decisión 5: Copia física del proyecto en C:\BD para compilar

Se decidió utilizar temporalmente una copia física del proyecto en `C:\BD` para desbloquear la generación del APK Release.

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | El NDK de Windows no respeta `LongPathsEnabled`. Desde la ruta original (`C:\ProyectosMovil\BurritoDriverApp\`), CMake genera rutas de archivos `.o` que exceden 260 caracteres. |
| **Ventajas** | Solución inmediata y funcional. Sin cambios en runtime ni en código de la app. |
| **Desventajas** | La copia física introduce riesgo de divergencia si se modifica solo una de las copias. Debe reemplazarse por un junction symlink. |

### Decisión 6: Documentar el incidente como referencia oficial

Se decidió crear este documento (`docs/build-recovery-report.md`) para registrar el incidente completo: síntomas, causas, correcciones aplicadas, deuda técnica y criterios de eliminación.

| Aspecto | Detalle |
|---------|---------|
| **Motivo** | Evitar que el conocimiento del incidente se pierda. Servir como referencia para futuras investigaciones de build y para la migración a New Architecture. |
| **Ventajas** | Trazabilidad completa del incidente. Facilita la incorporación de nuevos desarrolladores. |
| **Desventajas** | Requiere mantenimiento si cambian las condiciones del fix. |

---

## 8. Trabajo pendiente

### 8.1 Limpieza

- [ ] Eliminar `rnconfig.json` y `rnconfig2.json` de `C:\BD`
- [ ] Eliminar `estructura.txt` y `estructura_driver_src_REAL.txt` de la raíz del proyecto
- [ ] Agregar `*.json` de diagnóstico al `.gitignore`
- [ ] Verificar que no queden archivos temporales sueltos

### 8.2 Documentación

- [ ] Agregar al `AGENTS.md`:
  - Existencia y propósito de `scripts/fix-geolocation-codegen.js`
  - Problema de rutas largas con gesture-handler 3.x en Windows
  - Comando para generar APK Release desde ruta corta
  - Comando para limpiar artefactos de build
- [ ] Mejorar el encabezado del script `fix-geolocation-codegen.js` (agregar "TEMPORARY WORKAROUND", referencia a este documento)

### 8.3 Integración de UI

- [ ] Fusionar la rama `uix-driverapp` → `pruebas-bateria-datos` para recuperar el rediseño de UI
- [ ] Resolver conflictos esperados en `package.json` y `android/app/build.gradle`

### 8.4 Reemplazo de C:\BD por junction

- [ ] Verificar que ambos proyectos tengan el mismo HEAD y working directory
- [ ] Crear respaldo de seguridad
- [ ] Eliminar `C:\BD` (copia física)
- [ ] Crear junction symlink: `mklink /J C:\BD C:\ProyectosMovil\BurritoDriverApp`
- [ ] Verificar compilación desde el junction

### 8.5 Migración futura (sin fecha definida)

- [ ] Evaluar migración a New Architecture cuando todas las dependencias la soporten completamente
- [ ] En ese momento: eliminar `scripts/fix-geolocation-codegen.js` y el `postinstall`
- [ ] Restaurar `newArchEnabled=true`
- [ ] Reevaluar gesture-handler para ver si la estructura de archivos cambió y el límite de 256 ya no es problema

---

## 9. Criterios para eliminar el workaround

El script `scripts/fix-geolocation-codegen.js` y su `postinstall` deben eliminarse si **cualquiera** de las siguientes condiciones se cumple:

### Condición 1: Migración a New Architecture

- Se cambia `newArchEnabled=true` en `android/gradle.properties`
- **Motivo**: Bajo New Architecture, geolocation DEBE generar su codegen. El script lo impediría.

### Condición 2: Fix oficial de React Native CLI

- Una versión futura de `@react-native-community/cli` (≥20.x) corrige `findLibraryName.js` para no hacer regex sobre `build.gradle`, o respeta `newArchEnabled` en el autolinking.
- **Verificar**: Ejecutar `npx react-native config` y confirmar que geolocation ya no reporta `libraryName: "RNCGeolocation"` sin el parche.

### Condición 3: Fix oficial de @react-native-community/geolocation

- Una versión futura de la librería elimina el bloque `react { libraryName }` de su `build.gradle`, o elimina `codegenConfig` de su `package.json`.
- **Verificar**: Inspeccionar el `package.json` y `android/build.gradle` de la nueva versión.

### Procedimiento para eliminar

```bash
# 1. Revertir cambios en package.json (quitar postinstall)
git checkout HEAD -- package.json

# 2. Eliminar el script
rm scripts/fix-geolocation-codegen.js

# 3. Reinstalar dependencias (ya no se aplica el parche)
npm install

# 4. Verificar que el build funciona sin el parche
cd android && ./gradlew assembleRelease

# 5. Si falla, revertir y esperar a que las condiciones se cumplan
```

---

## 10. Referencias técnicas

### Archivos modificados/creados en el proyecto

| Archivo | Ruta absoluta |
|---------|---------------|
| Package.json | `C:\ProyectosMovil\BurritoDriverApp\package.json` |
| Gradle properties | `C:\ProyectosMovil\BurritoDriverApp\android\gradle.properties` |
| Script postinstall | `C:\ProyectosMovil\BurritoDriverApp\scripts\fix-geolocation-codegen.js` |
| Este documento | `C:\ProyectosMovil\BurritoDriverApp\docs\build-recovery-report.md` |

### Archivos del ecosistema del proyecto

| Archivo | Ruta |
|---------|------|
| AGENTS.md | `C:\ProyectosMovil\BurritoDriverApp\AGENTS.md` |
| Documentación general | `C:\ProyectosMovil\docs\` |
| README.md | `C:\ProyectosMovil\BurritoDriverApp\README.md` |

### Código fuente de RN involucrado (node_modules)

| Archivo | Rol |
|---------|-----|
| `node_modules/@react-native/gradle-plugin/.../tasks/GenerateAutolinkingNewArchitecturesFileTask.kt` | Genera `Android-autolinking.cmake` con `add_subdirectory` |
| `node_modules/@react-native/gradle-plugin/.../ReactRootProjectPlugin.kt` | Fuerza `newArchEnabled=true` en subproyectos |
| `node_modules/@react-native/gradle-plugin/.../utils/ProjectUtils.kt` | `isNewArchEnabled()` hardcodeado a `true` |
| `node_modules/@react-native-community/cli-config-android/.../findLibraryName.js` | Detecta `libraryName` por regex textual sobre `build.gradle` |
| `node_modules/@react-native-community/geolocation/package.json` | Contenía `codegenConfig` (eliminado por postinstall) |
| `node_modules/@react-native-community/geolocation/android/build.gradle` | Contenía `react { libraryName = "RNCGeolocation" }` (eliminado por postinstall) |

### APK generado

| Recurso | Ruta |
|---------|------|
| APK Release | `C:\BD\android\app\build\outputs\apk\release\app-release.apk` (~60 MB) |

---

## 11. Lecciones aprendidas

### Lección 1: No modificar node_modules directamente sin un mecanismo reproducible

Editar archivos dentro de `node_modules` a mano para diagnosticar o corregir es aceptable durante la investigación, pero debe formalizarse con un script reproducible antes de darlo por solucionado. En este incidente, la edición manual eliminó accidentalmente el bloque `dependencies {}` de geolocation, causando 30+ errores de compilación.

### Lección 2: No mantener copias físicas del proyecto para compilar

Una copia física (`C:\BD`) resuelve el problema inmediato pero introduce riesgo de divergencia: cambios aplicados solo en una copia pueden perderse si no se sincronizan manualmente. La solución permanente (junction symlink) debe implementarse lo antes posible.

### Lección 3: Toda solución temporal debe estar documentada y tener un criterio explícito de eliminación

Sin un criterio claro para remover un workaround, este tiende a permanecer indefinidamente. Este documento define tres condiciones concretas (sección 9) que determinan cuándo el postinstall puede eliminarse de forma segura.

### Lección 4: Los problemas de build deben investigarse separadamente de los cambios funcionales

Intentar diagnosticar un error de compilación mientras se integran cambios de otra rama (UI, features) añade variables que dificultan el aislamiento de la causa raíz. El build debe estar verde antes de fusionar ramas funcionales.

### Lección 5: Antes de actualizar dependencias nativas, revisar su compatibilidad con la versión de React Native en uso

`react-native-gesture-handler@3.x` movió archivos C++ fuera del directorio `android/`, lo que expuso el límite de 260 caracteres del NDK de Windows. Una revisión previa de los cambios estructurales entre versiones mayores habría anticipado este problema.

### Lección 6: Distinguir entre evidencia, inferencia e hipótesis en la documentación técnica

La documentación de un incidente debe etiquetar cada afirmación según su nivel de certeza: lo que el repositorio demuestra (evidencia), lo que se deduce del comportamiento observado (inferencia), y lo que se propone como explicación no confirmada (hipótesis). Esto evita que suposiciones sean tratadas como hechos en investigaciones futuras.

---

*Fin del documento. Última actualización: Julio 2026.*
