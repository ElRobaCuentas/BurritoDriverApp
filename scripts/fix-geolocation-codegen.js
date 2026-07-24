/**
 * TEMPORARY WORKAROUND
 *
 * Issue:
 * React Native 0.83 + @react-native-community/geolocation 3.4.0
 * incorrectly generates Codegen autolinking even when
 * newArchEnabled=false.
 *
 * This script removes the phantom Codegen configuration after
 * every npm install.
 *
 * See:
 * docs/build-recovery-report.md
 *
 * Remove this workaround once either:
 * - RN CLI fixes the autolinking detection
 * - Geolocation no longer exposes this issue
 */
'use strict';

const fs = require('fs');
const path = require('path');

const pkgDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'geolocation',
);

if (!fs.existsSync(pkgDir)) {
  process.exit(0);
}

const EXPECTED_VERSION = '3.4.0';

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (manifest.version !== EXPECTED_VERSION) {
    console.warn(
      '[fix-geolocation] WARNING: geolocation version ' + manifest.version +
      ' detectada. El workaround fue dise\u00f1ado para ' + EXPECTED_VERSION +
      '. Revisar docs/build-recovery-report.md para confirmar si sigue siendo necesario.'
    );
  }
} catch (_) {}

let changed = false;

// 1) Quitar codegenConfig del package.json de la librería.
const pkgJsonPath = path.join(pkgDir, 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  if (pkg.codegenConfig) {
    delete pkg.codegenConfig;
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    changed = true;
    console.log('[fix-geolocation] codegenConfig eliminado de package.json');
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.warn('[fix-geolocation] package.json no encontrado en', pkgJsonPath);
  } else {
    console.error('[fix-geolocation] Error al procesar package.json:', e.message);
    process.exit(1);
  }
}

// 2) Quitar el bloque `if (isNewArchitectureEnabled()) { react { ... } }`
//    (código muerto con old arch) del android/build.gradle, para que el regex
//    del CLI no encuentre `libraryName = "..."`.
const gradlePath = path.join(pkgDir, 'android', 'build.gradle');
try {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const reactBlock =
    /\n*if \(isNewArchitectureEnabled\(\)\)\s*\{\s*react\s*\{[\s\S]*?\}\s*\}\s*/;
  if (reactBlock.test(gradle)) {
    gradle = gradle.replace(reactBlock, '\n');
    fs.writeFileSync(gradlePath, gradle);
    changed = true;
    console.log('[fix-geolocation] bloque react{} eliminado de build.gradle');
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.warn('[fix-geolocation] build.gradle no encontrado en', gradlePath);
  } else {
    console.error('[fix-geolocation] Error al procesar build.gradle:', e.message);
    process.exit(1);
  }
}

// Limpiar backup basura que pudo dejar una edición manual previa.
const bak = path.join(pkgDir, 'package.json.bak');
if (fs.existsSync(bak)) {
  fs.unlinkSync(bak);
  console.log('[fix-geolocation] package.json.bak eliminado');
}

if (!changed) {
  console.log('[fix-geolocation] geolocation ya estaba OK (nada que cambiar)');
}
