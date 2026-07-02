import React, { useEffect, useState, useRef } from 'react';
import {
    AppState, PermissionsAndroid, Platform,
    Pressable, StyleSheet, Text, View, ScrollView,
    DeviceEventEmitter, Alert, Linking, ActivityIndicator
} from 'react-native';
// T11: Importamos las nuevas funciones dinámicas y la base de datos
import { updateBusLocation, stopBusService } from '../services/firebase_service';
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';

interface Props {
    driverDni: string;
}

const sendLog = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
        id: Math.random(),
        t: `[${timestamp}] ${text}`,
        type
    });
};

const locationTask = async (taskDataArguments: any) => {
    // T11: Rescatamos también el busId inyectado
    const { uidChofer, busId } = taskDataArguments; 
    sendLog(`🚀 MOTOR: ¡VIVO CON CHOFER ${uidChofer.substring(0,6)}...!`, "success");

    return new Promise<void>((resolve) => {
        const watchId = Geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;
                sendLog(`✅ POSICIÓN: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");

                try {
                    sendLog("☁️ Subiendo a Firebase...");
                    // T11: Usamos updateBusLocation con la placa dinámica
                    await updateBusLocation(busId, {
                        latitude,
                        longitude,
                        heading: heading ?? 0,
                        speed: speed ?? 0,
                        timestamp: Date.now(),
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
                distanceFilter: 2, 
                interval: 3000,    
                fastestInterval: 2000, 
            }
        );

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

// T11: Agregamos busId a las opciones
const getBackgroundOptions = (uid: string, busId: string) => ({
    taskName: 'BurritoTracker',
    taskTitle: `El Bus ${busId} está en ruta`,
    taskDesc: 'Transmitiendo ubicación...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { uidChofer: uid, busId },
    ongoing: true,
    foregroundServiceType: ['location' as const],
});

const requestAllPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
        sendLog("🛡️ Paso 1/3: Pidiendo permiso de notificaciones...");
        const notifGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            sendLog("❌ NOTIFICACIONES DENEGADAS", "error");
            Alert.alert("Permiso crítico denegado", "Sin notificaciones, el rastreo se detiene en segundo plano.", [
                { text: "Cancelar", style: "cancel" },
                { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
            ]);
            return false;
        }
    }
    const fineGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO GPS DENEGADO", "error");
        return false;
    }
    const bgGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO SEGUNDO PLANO DENEGADO", "error");
        return false;
    }
    return true;
};

export const SendCoordinates = ({ driverDni }: Props) => {
    const [isSending, setIsSending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const scrollRef = useRef<ScrollView>(null);
    
    // T11: Nuevos estados para la auto-asignación
    const [busId, setBusId] = useState<string | null>(null);
    const [asignacionId, setAsignacionId] = useState<string | null>(null);
    const [loadingAssignment, setLoadingAssignment] = useState(true);

    useEffect(() => {
        const logSubscription = DeviceEventEmitter.addListener('PRO_DEBUG_LOG', (newLog) => {
            setLogs(prev => [...prev, newLog].slice(-30));
        });

        const appStateSub = AppState.addEventListener('change', (state) => {
            sendLog(`📱 APP STATE: ${state.toUpperCase()}`);
        });

        // T11: Consulta Dinámica Oficial en la Nube con Filtros
        const fetchAssignment = async () => {
            try {
                // Generamos la fecha local real del dispositivo en formato YYYY-MM-DD
                const d = new Date();
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const today = `${year}-${month}-${day}`;
                
                sendLog(`Buscando asignación para hoy (${today})...`);

                // Filtro en la nube gracias a la nueva regla indexOn
                const snapshot = await database().ref('/asignaciones')
                    .orderByChild('choferId')
                    .equalTo(driverDni)
                    .once('value');

                let foundBusId: string | null = null;
                let foundAsignacionId: string | null = null;

                if (snapshot.exists()) {
                    snapshot.forEach((child) => {
                        const val = child.val();
                        // Comparamos fecha y que esté activo
                        if (val.fecha === today && val.activo === true) {
                            foundBusId = val.busId;
                            foundAsignacionId = child.key;
                        }
                        return undefined;
                    });
                }

                if (foundBusId) {
                    setBusId(foundBusId);
                    setAsignacionId(foundAsignacionId);
                    sendLog(`🚌 Bus asignado: ${foundBusId}`, "success");
                } else {
                    sendLog(`❌ No hay asignación para hoy (${today}).`, "error");
                }
            } catch (err: any) {
                sendLog(`❌ Error consultando asignación: ${err.message}`, "error");
            } finally {
                setLoadingAssignment(false);
            }
        };

        fetchAssignment();

        return () => {
            logSubscription.remove();
            appStateSub.remove();
        };
    }, [driverDni]);

    const startProcess = async () => {
        if (!busId) {
            Alert.alert("Bloqueo", "No tienes un bus asignado para hoy. Contacta a la oficina.");
            return;
        }

        if (BackgroundJob.isRunning()) return;

        setLogs([]);
        sendLog("▶️ Botón presionado: Iniciando...", "info");

        try {
            const permisosOk = await requestAllPermissions();
            if (!permisosOk) return;

            sendLog("⚙️ Arrancando Background Service...");
            // T11: Inyectamos el driverDni y el busId al servicio
            const options = getBackgroundOptions(driverDni, busId);
            await BackgroundJob.start(locationTask, options);
            
            setIsSending(true);
            sendLog(`✅ MOTOR ACTIVO — Transmitiendo para ${busId}`, "success");

        } catch (e: any) {
            sendLog(`❌ CRASH UI: ${e.message}`, "error");
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Está seguro de que desea cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí, cerrar sesión', style: 'destructive', onPress: () => auth().signOut() },
            ]
        );
    };

    const stopProcess = async () => {
        sendLog("⏹️ Deteniendo proceso...");
        await BackgroundJob.stop();
        if (busId) {
            await stopBusService(busId);
        }
        setIsSending(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.mainTitle}>🔥 PANTALLA DE TRACKING 🔥</Text>
            <Text style={{ textAlign: 'center', color: '#555', fontSize: 11 }}>DNI Conductor: {driverDni}</Text>

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
                {loadingAssignment ? (
                    <ActivityIndicator size="large" color="#2060cd" style={{ marginBottom: 20 }} />
                ) : isSending ? (
                    <>
                        <Pressable
                            onPress={stopProcess}
                            style={[styles.btn, { backgroundColor: '#d32f2f' }]}
                        >
                            <Text style={styles.btnText}>⏹ DETENER RECORRIDO</Text>
                        </Pressable>
                    </>
                ) : (
                    <>
                        {!busId && (
                            <Text style={styles.errorText}>
                                ⚠️ No tienes un bus asignado para hoy. Contacta a la oficina.
                            </Text>
                        )}
                        <Pressable
                            onPress={startProcess}
                            style={[styles.btn, { backgroundColor: !busId ? '#888' : '#2060cd' }]}
                            disabled={!busId}
                        >
                            <Text style={styles.btnText}>🚀 INICIAR RECORRIDO</Text>
                        </Pressable>

                        <Pressable
                            onPress={handleLogout}
                            style={[styles.btn, { backgroundColor: '#d32f2f' }]}
                        >
                            <Text style={styles.btnText}>🔒 Cerrar sesión</Text>
                        </Pressable>
                    </>
                )}
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
        borderColor: '#2060cd',
        borderRadius: 5,
    },
    consoleTitle: { color: '#000', fontSize: 14, fontWeight: 'bold', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#CCC' },
    scroll:       { flex: 1 },
    logLine:      { fontFamily: 'monospace', fontSize: 12, marginBottom: 4 },
    buttons:      { padding: 20 },
    btn:          { padding: 20, borderRadius: 10, marginBottom: 10, alignItems: 'center', elevation: 5 },
    btnText:      { color: 'white', fontWeight: 'bold', fontSize: 16 },
    errorText:    { color: '#d32f2f', textAlign: 'center', marginBottom: 10, fontWeight: 'bold', fontSize: 13 }
});