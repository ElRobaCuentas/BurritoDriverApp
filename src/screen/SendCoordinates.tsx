import React, { useEffect, useState, useRef } from 'react';
import {
    AppState, PermissionsAndroid, Platform,
    Pressable, StyleSheet, Text, View, ScrollView,
    DeviceEventEmitter, Alert, Linking
} from 'react-native';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';

const GPS_TIMEOUT_MS   = 10000;
const MAX_AGE_MS       = 2500;

const sendLog = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
        id: Math.random(),
        t: `[${timestamp}] ${text}`,
        type
    });
};

const locationTask = async (taskDataArguments: any) => {
    sendLog("🚀 MOTOR: ¡VIVO Y CORRIENDO!", "success");

    return new Promise<void>((resolve) => {
        const watchId = Geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;
                sendLog(`✅ POSICIÓN: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");

                try {
                    sendLog("☁️ Subiendo a Firebase...");
                    await updateBurritoLocation({
                        latitude,
                        longitude,
                        heading: heading ?? 0,
                        speed: speed ?? 0,
                        timestamp: Date.now(), // ACUERDO: El reloj local de tu celular
                    });
                    sendLog("✅ FIREBASE ACTUALIZADO", "success");
                } catch (err: any) {
                    sendLog(`❌ FALLO FIREBASE: ${err.message}`, "error");
                }
            },
            (err) => {
                sendLog(`❌ FALLO GPS: ${err.message}`, "error");
            },
            {
                enableHighAccuracy: true,
                distanceFilter: 2, // Ignora el temblor estático menor a 2 metros
                interval: 3000,    // Android pide actualización cada 3 segundos
                fastestInterval: 2000, // Pero acepta si llega en 2 segundos
            }
        );

        // Mantenemos la tarea viva mientras BackgroundJob esté corriendo
        const keepAlive = setInterval(() => {
            if (!BackgroundJob.isRunning()) {
                Geolocation.clearWatch(watchId);
                clearInterval(keepAlive);
                sendLog("🛑 MOTOR APAGADO", "error");
                resolve();
            }
        }, 1000);
    });
};

const backgroundOptions = {
    taskName: 'BurritoTracker',
    taskTitle: 'El Burrito está en ruta',
    taskDesc: 'Transmitiendo ubicación...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: 3000 },
    ongoing: true,
};

const requestAllPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
        sendLog("🛡️ Paso 1/3: Pidiendo permiso de notificaciones...");
        const notifGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            sendLog("❌ NOTIFICACIONES DENEGADAS", "error");
            Alert.alert(
                "Permiso crítico denegado",
                "Sin permiso de notificaciones, el rastreo se detiene en segundo plano. Ve a Ajustes → Apps → BurritoDriver → Notificaciones y actívalas.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
                ]
            );
            return false;
        }
        sendLog("✅ Paso 1/3: Notificaciones concedidas", "success");
    } else {
        sendLog("✅ Paso 1/3: Notificaciones — no requerido", "success");
    }

    sendLog("🛡️ Paso 2/3: Pidiendo ubicación precisa...");
    const fineGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO GPS DENEGADO", "error");
        Alert.alert("Permiso Requerido", "Necesitamos acceso al GPS para rastrear el bus.");
        return false;
    }
    sendLog("✅ Paso 2/3: Ubicación precisa concedida", "success");

    sendLog("🛡️ Paso 3/3: Pidiendo ubicación en segundo plano...");
    const bgGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
    );

    if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO SEGUNDO PLANO DENEGADO", "error");
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
    sendLog("✅ Paso 3/3: Segundo plano concedido", "success");

    return true;
};

export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const scrollRef = useRef<ScrollView>(null);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            sendLog("✅ MOTOR ACTIVO — GPS transmitiendo", "success");

            // CORRECCIÓN: Enviamos solo el timestamp. 
            // El servicio se encarga de poner el isActive: true
            heartbeatRef.current = setInterval(async () => {
                try {
                    await updateBurritoLocation({ 
                        timestamp: Date.now() 
                    });
                    sendLog("💓 Latido enviado", "info");
                } catch (e: any) {
                    sendLog(`❌ Error Latido: ${e.message}`, "error");
                }
            }, 8000);

        } catch (e: any) {
            sendLog(`❌ CRASH UI: ${e.message}`, "error");
        }
    };

    const stopProcess = async () => {
        sendLog("⏹️ Deteniendo proceso...");
        
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }

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