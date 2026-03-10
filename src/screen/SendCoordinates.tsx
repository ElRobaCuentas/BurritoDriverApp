import React, { useEffect, useState, useRef } from 'react';
import {
    AppState, PermissionsAndroid, Platform,
    Pressable, StyleSheet, Text, View, ScrollView,
    DeviceEventEmitter, Alert, Linking
} from 'react-native';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import BackgroundJob from 'react-native-background-actions';
import Geolocation, { GeolocationResponse } from '@react-native-community/geolocation';

const SEND_INTERVAL_MS = 3000;
const GPS_TIMEOUT_MS   = 10000;
const MAX_AGE_MS       = 4000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const sendLog = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
        id: Math.random(),
        t: `[${timestamp}] ${text}`,
        type
    });
};

const getCurrentPositionAsync = (): Promise<GeolocationResponse> =>
    new Promise((resolve, reject) =>
        Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GPS_TIMEOUT_MS,
            maximumAge: MAX_AGE_MS,
        })
    );

const locationTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;
    let iteration = 1;

    sendLog("🚀 MOTOR: ¡VIVO Y CORRIENDO!", "success");

    while (BackgroundJob.isRunning()) {
        sendLog(`⏱️ Iteración #${iteration}`);
        iteration++;
        let position;

        // --- BLOQUE 1: INTENTAR OBTENER GPS ---
        try {
            sendLog("🛰️ Consultando sensor GPS...");
            position = await getCurrentPositionAsync();
            const { latitude, longitude } = position.coords;
            sendLog(`✅ POSICIÓN: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");
        } catch (err: any) {
            sendLog(`❌ FALLO GPS: ${err.message}`, "error");
            await sleep(delay);
            continue;
        }

        // --- BLOQUE 2: INTENTAR SUBIR A FIREBASE ---
        try {
            sendLog("☁️ Subiendo a Firebase...");
            await updateBurritoLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                heading: position.coords.heading ?? 0,
                speed: position.coords.speed ?? 0,
            });
            sendLog("✅ FIREBASE ACTUALIZADO", "success");
        } catch (err: any) {
            sendLog(`❌ FALLO FIREBASE: ${err.message}`, "error");
        }

        await sleep(delay);
    }
    sendLog("🛑 MOTOR APAGADO", "error");
};

const backgroundOptions = {
    taskName: 'BurritoTracker',
    taskTitle: 'El Burrito está en ruta',
    taskDesc: 'Transmitiendo ubicación...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: SEND_INTERVAL_MS },
    ongoing: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// SE PIDEN 3 PERMISOS EN ORDEN ESTRICTO:
//
// PERMISO 0 — POST_NOTIFICATIONS (Android 13+)
//   ERA EL PROBLEMA RAÍZ. Estaba en el Manifest pero nunca se pedía en runtime.
//   Sin este permiso, Android bloquea la notificación persistente silenciosamente.
//   Sin notificación = el Foreground Service nunca se ancla al sistema.
//   Sin Foreground Service real = Android mata el proceso al ir al fondo.
//   Resultado: 2 peticiones más y para. Exactamente lo que veíamos.
//
// PERMISO 1 — ACCESS_FINE_LOCATION
//   La ventanita normal de GPS. Debe pedirse antes que el de segundo plano.
//
// PERMISO 2 — ACCESS_BACKGROUND_LOCATION
//   Android 13/14/15 exige pedirlo en un paso separado DESPUÉS del primero.
//   El usuario debe elegir "Permitir siempre" o el GPS se para con pantalla apagada.
// ─────────────────────────────────────────────────────────────────────────────
const requestAllPermissions = async (): Promise<boolean> => {

    // ── PERMISO 0: NOTIFICACIONES (el que faltaba) ──────────────────────────
    // Solo necesario en Android 13 (API 33) en adelante.
    // En Android 12 o menos, las notificaciones se conceden automáticamente.
    if (Platform.OS === 'android' && Platform.Version >= 33) {
        sendLog("🛡️ Paso 1/3: Pidiendo permiso de notificaciones...");
        const notifGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            sendLog("❌ NOTIFICACIONES DENEGADAS — El Foreground Service no puede anclarse", "error");
            Alert.alert(
                "Permiso crítico denegado",
                "Sin permiso de notificaciones, el rastreo se detiene en segundo plano. Ve a Ajustes → Apps → BurritoDriver → Notificaciones y actívalas.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
                ]
            );
            return false; // Sin este permiso no tiene sentido continuar
        }
        sendLog("✅ Paso 1/3: Notificaciones concedidas", "success");
    } else {
        sendLog("✅ Paso 1/3: Notificaciones — no requerido en esta versión de Android", "success");
    }

    // ── PERMISO 1: UBICACIÓN PRECISA ─────────────────────────────────────────
    sendLog("🛡️ Paso 2/3: Pidiendo ubicación precisa...");
    const fineGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO GPS DENEGADO", "error");
        Alert.alert(
            "Permiso Requerido",
            "Necesitamos acceso al GPS para rastrear el bus.",
        );
        return false;
    }
    sendLog("✅ Paso 2/3: Ubicación precisa concedida", "success");

    // ── PERMISO 2: UBICACIÓN EN SEGUNDO PLANO ────────────────────────────────
    // Android abre su propia pantalla de configuración.
    // El conductor DEBE elegir "Permitir siempre".
    sendLog("🛡️ Paso 3/3: Pidiendo ubicación en segundo plano...");
    const bgGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
    );

    if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO SEGUNDO PLANO DENEGADO — GPS se pausará al apagar pantalla", "error");
        Alert.alert(
            "Paso necesario",
            "Para rastrear el bus con la pantalla apagada, ve a Ajustes → Ubicación → 'Permitir siempre'.",
            [
                { text: "Cancelar", style: "cancel" },
                { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
            ]
        );
        return false;
    }
    sendLog("✅ Paso 3/3: Segundo plano concedido — GPS activo con pantalla apagada", "success");

    return true;
};

export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        const logSubscription = DeviceEventEmitter.addListener('PRO_DEBUG_LOG', (newLog) => {
            setLogs(prev => [...prev, newLog].slice(-30));
        });

        const appStateSub = AppState.addEventListener('change', (state) => {
            sendLog(`📱 APP STATE: ${state.toUpperCase()}`);
        });

        return () => {
            logSubscription.remove();
            appStateSub.remove();
        };
    }, []);

    const startProcess = async () => {
        if (BackgroundJob.isRunning()) return;

        setLogs([]);
        sendLog("▶️ Botón presionado: Iniciando...", "info");

        try {
            const permisosOk = await requestAllPermissions();
            if (!permisosOk) return;

            sendLog("⚙️ Arrancando Background Service...");
            await BackgroundJob.start(locationTask, backgroundOptions);
            setIsSending(true);
            sendLog("✅ MOTOR ACTIVO — GPS transmitiendo cada 3 segundos", "success");
            sendLog("🔔 Busca la notificación persistente en tu barra de estado", "info");

            // Advertencia de batería para Honor/Huawei
            // MagicOS mata procesos en segundo plano aunque tengan todos los permisos.
            // El conductor debe desactivar el ahorro de energía manualmente.
            Alert.alert(
                "⚠️ Último paso — Honor X7B",
                "Ve a Ajustes → Batería → BurritoDriverApp y desactiva el ahorro de energía. Sin esto MagicOS puede cortar el rastreo al apagar la pantalla.",
                [
                    { text: "Entendido", style: "cancel" },
                    { text: "Ir a Ajustes", onPress: () => Linking.openSettings() }
                ]
            );

        } catch (e: any) {
            sendLog(`❌ CRASH UI: ${e.message}`, "error");
        }
    };

    const stopProcess = async () => {
        sendLog("⏹️ Deteniendo proceso...");
        await BackgroundJob.stop();
        await stopBurritoService();
        setIsSending(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.mainTitle}>🔥 PANTALLA DE DEBUG 🔥</Text>

            <View style={styles.console}>
                <Text style={styles.consoleTitle}> TERMINAL DE EVENTOS </Text>
                <ScrollView
                    ref={scrollRef}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    style={styles.scroll}
                >
                    {logs.map(log => (
                        <Text key={log.id} style={[
                            styles.logLine,
                            log.type === 'error'   ? { color: '#cc0000' } :
                            log.type === 'success' ? { color: '#008800' } :
                                                     { color: '#000000' }
                        ]}>
                            {log.t}
                        </Text>
                    ))}
                </ScrollView>
            </View>

            <View style={styles.buttons}>
                <Pressable
                    onPress={startProcess}
                    style={[styles.btn, { backgroundColor: isSending ? '#888' : '#2060cd' }]}
                >
                    <Text style={styles.btnText}>
                        {isSending ? '🚌 TRANSMITIENDO...' : '🚀 INICIAR DEBUG'}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={stopProcess}
                    style={[styles.btn, { backgroundColor: '#d32f2f' }]}
                >
                    <Text style={styles.btnText}>⏹ DETENER TODO</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container:    { flex: 1, backgroundColor: '#FFFFFF' },
    mainTitle:    { fontSize: 20, fontWeight: 'bold', color: '#000', textAlign: 'center', marginTop: 20 },
    console: {
        flex: 1,
        backgroundColor: '#F5F5F5',
        margin: 15,
        padding: 10,
        borderWidth: 4,
        borderColor: '#FF0000',
        borderRadius: 5,
    },
    consoleTitle: { color: '#000', fontSize: 14, fontWeight: 'bold', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#CCC' },
    scroll:       { flex: 1 },
    logLine:      { fontFamily: 'monospace', fontSize: 12, marginBottom: 4 },
    buttons:      { padding: 20 },
    btn:          { padding: 20, borderRadius: 10, marginBottom: 10, alignItems: 'center', elevation: 5 },
    btnText:      { color: 'white', fontWeight: 'bold', fontSize: 16 }
});