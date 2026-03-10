import React, { useEffect, useState, useRef } from 'react';
import {
    AppState, PermissionsAndroid,
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
// ARQUITECTURA (Claude): Función separada → startProcess queda limpio y legible
// UX (Gemini): Alert con botón "Abrir Ajustes" en lugar de solo un log en rojo
//
// PROBLEMA QUE RESUELVE:
// Android 13/14 separa ACCESS_FINE_LOCATION y ACCESS_BACKGROUND_LOCATION en
// dos permisos distintos que DEBEN pedirse en dos pasos y en ese orden.
// Tenerlos declarados en el Manifest no es suficiente: si no se piden en
// runtime, Android bloquea el GPS en cuanto la app sale del primer plano.
// Resultado anterior: el tracker se congelaba al apagar la pantalla.
// ─────────────────────────────────────────────────────────────────────────────
const requestAllPermissions = async (): Promise<boolean> => {

    // PASO 1: Ubicación precisa — la ventanita normal de Android
    sendLog("🛡️ Paso 1/2: Pidiendo ubicación precisa...");
    const fineGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO GPS DENEGADO", "error");
        Alert.alert("Permiso Requerido", "Necesitamos acceso al GPS para rastrear el bus.");
        return false;
    }

    sendLog("✅ Paso 1/2: Ubicación precisa concedida", "success");

    // PASO 2: Ubicación en segundo plano — Android abre su propia pantalla
    // El conductor DEBE elegir "Permitir siempre" (no "Solo mientras se usa la app")
    // Si elige la opción incorrecta, el GPS se pausará al bloquear la pantalla.
    sendLog("🛡️ Paso 2/2: Pidiendo ubicación en segundo plano...");
    const bgGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
    );

    if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO SEGUNDO PLANO DENEGADO — El tracker no funcionará con pantalla apagada", "error");
        // UX (Gemini): popup con botón directo a ajustes, no solo texto en consola
        Alert.alert(
            "Paso necesario",
            "Para rastrear el bus con la pantalla apagada, ve a Ajustes → Ubicación → 'Permitir siempre'.",
            [
                { text: "Cancelar", style: "cancel" },
                { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
            ]
        );
        return false; // Bloqueamos el inicio — sin este permiso el tracker no sirve en producción
    }

    sendLog("✅ Paso 2/2: Segundo plano concedido — GPS activo con pantalla apagada", "success");
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
            // La lógica de permisos vive en su propia función → este bloque queda limpio
            const permisosOk = await requestAllPermissions();
            if (!permisosOk) return;

            sendLog("⚙️ Arrancando Background Service...");
            await BackgroundJob.start(locationTask, backgroundOptions);
            setIsSending(true);
            sendLog("✅ MOTOR ACTIVO — GPS transmitiendo cada 3 segundos", "success");

            // UX (Gemini): advertencia de batería obligatoria para Honor/Huawei
            // MagicOS corta el acceso a internet en segundo plano aunque el permiso
            // de ubicación esté concedido. Sin desactivar el ahorro de batería,
            // el tracker puede detenerse a los 10 minutos de apagar la pantalla.
            Alert.alert(
                "⚠️ Último paso importante",
                "En tu celular Honor, ve a Ajustes → Batería → BurritoDriverApp y desactiva el ahorro de energía. Sin esto, el rastreo puede detenerse al apagar la pantalla.",
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