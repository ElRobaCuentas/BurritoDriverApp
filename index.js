/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { DriverApp } from './src/DriverApp';
import { name as appName } from './app.json';

// Se eliminó database().setPersistenceEnabled(true)
//
// ¿Por qué estaba? Firebase trae esta opción para apps que necesitan
// mostrar datos aunque no haya internet (como una lista de tareas offline).
//
// ¿Por qué lo quitamos? Somos un tracker en tiempo real. Si el bus pierde
// señal 10 minutos y la persistencia está activa, Firebase acumula ~200
// ubicaciones en memoria. Cuando la señal vuelve, las sube todas de golpe.
// La app del estudiante recibe una ráfaga y el bus "viaja en el tiempo"
// por el mapa a velocidad imposible.
//
// Con persistencia DESACTIVADA (el valor por defecto de Firebase):
// Si no hay señal, ese intento de envío falla y se descarta.
// El siguiente intento (3 segundos después) envía la posición ACTUAL.
// Resultado: cuando la señal vuelve, el bus aparece donde realmente está.
// Un salto limpio de una posición a otra, no un video acelerado.

AppRegistry.registerComponent(appName, () => DriverApp);