import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { COLORS } from '../shared/theme/colors';
import { TYPOGRAPHY } from '../shared/theme/typography';

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

// C3: Constantes del watchdog de reinicio automático
const PULSE_TIMEOUT_MS = 30000;
const WATCHDOG_INTERVAL_MS = 10000;

const locationTask = async (taskDataArguments: any) => {
    // T11: Rescatamos también el busId inyectado
    const { uidChofer, busId } = taskDataArguments; 
    sendLog(`🚀 MOTOR: ¡VIVO CON CHOFER ${uidChofer.substring(0,6)}...!`, "success");

    return new Promise<void>((resolve) => {
        const watchId = Geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;
                // C3: Pulso de vida hacia la UI (mismo canal que el debug panel)
                DeviceEventEmitter.emit('PRO_LOCATION_PULSE', { ts: Date.now() });
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
    
    // C3: Estado del watchdog de reinicio automático
    const lastPulseRef = useRef(0);
    const isRestartingRef = useRef(false);
    const [recoveryFailed, setRecoveryFailed] = useState(false);

    // C4.2: Evita que stopProcess se ejecute en paralelo (doble toque o watchdog)
    const isStoppingRef = useRef(false);
    
    // T11: Nuevos estados para la auto-asignación
    const [busId, setBusId] = useState<string | null>(null);
    const [asignacionId, setAsignacionId] = useState<string | null>(null);
    const [loadingAssignment, setLoadingAssignment] = useState(true);
    const [driverName, setDriverName] = useState<string | null>(null);

    const [showDebug, setShowDebug] = useState(true);

    useEffect(() => {
        const logSubscription = DeviceEventEmitter.addListener('PRO_DEBUG_LOG', (newLog) => {
            setLogs(prev => [...prev, newLog].slice(-30));
        });

        // C3: La UI escucha el pulso del motor para conocer la última posición enviada
        const pulseSubscription = DeviceEventEmitter.addListener('PRO_LOCATION_PULSE', (payload: { ts: number }) => {
            lastPulseRef.current = payload.ts;
        });

        const appStateSub = AppState.addEventListener('change', (state) => {
            sendLog(`📱 APP STATE: ${state.toUpperCase()}`);
        });

        // C4.7: Al re-montar, si el servicio sigue activo se restaura el estado visual.
        // Va después de los listeners (para que sendLog funcione) y antes de
        // fetchAssignment() porque únicamente restaura el estado del motor: no depende
        // de Firebase ni modifica la asignación. isRunning() conserva true cuando el
        // proceso y el singleton JS sobrevivieron al cierre de la app.
        if (BackgroundJob.isRunning()) {
            setLogs([]);
            lastPulseRef.current = Date.now();
            setRecoveryFailed(false);
            setIsSending(true);
            sendLog("ℹ️ Recorrido restaurado: el servicio seguía activo en segundo plano", "success");
        }

        // T11: Consulta Dinámica Oficial en la Nube con Filtros
        const fetchAssignment = async () => {
            try {
                // Generamos la fecha local real del dispositivo en formato YYYY-MM-DD
                const d = new Date();
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const today = `${year}-${month}-${day}`;
                
                try {
                    const choferSnapshot = await database()
                        .ref(`/choferes/${driverDni}`)
                        .once('value');
                    if (choferSnapshot.exists()) {
                        const chofer = choferSnapshot.val();
                        const fullName = `${chofer.nombre} ${chofer.apellidos}`.trim();
                        setDriverName(fullName);
                        sendLog(`👤 Conductor identificado: ${fullName}`, "success");
                    } else {
                        setDriverName(null);
                        sendLog(`⚠️ Sin registro en choferes, se usará el DNI (${driverDni})`, "error");
                    }
                } catch (err: any) {
                    setDriverName(null);
                    sendLog(`❌ Error consultando nombre del conductor: ${err.message}`, "error");
                }

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
            pulseSubscription.remove();
            appStateSub.remove();
        };
    }, [driverDni]);

    // C3: Arranca el BackgroundJob (usado por INICIAR y por el reinicio automático)
    const startBackgroundJob = useCallback(async () => {
        if (!busId) return;
        lastPulseRef.current = Date.now();
        // T11: Inyectamos el driverDni y el busId al servicio
        const options = getBackgroundOptions(driverDni, busId);
        await BackgroundJob.start(locationTask, options);
        setIsSending(true);
        setRecoveryFailed(false);
        sendLog(`✅ MOTOR ACTIVO — Transmitiendo para ${busId}`, "success");
    }, [busId, driverDni]);

    // C3: Detecta que el motor se detuvo en silencio y lo reinicia
    const restartBackgroundJob = useCallback(async () => {
        if (isRestartingRef.current) return;
        isRestartingRef.current = true;
        sendLog("⚠️ Motor sin pulsos: intentando reiniciar el servicio...", "error");
        try {
            await BackgroundJob.stop();
        } catch (e: any) {
            sendLog(`❌ Error deteniendo servicio previo: ${e.message}`, "error");
        }
        try {
            await startBackgroundJob();
            sendLog("🔄 SERVICIO REINICIADO", "success");
        } catch (e: any) {
            sendLog(`❌ NO SE PUDO REINICIAR: ${e.message}`, "error");
            setIsSending(false);
            setRecoveryFailed(true);
            Alert.alert(
                "Tracking detenido",
                "El envío de ubicación se detuvo y no pudo recuperarse automáticamente. Presiona INICIAR para reintentar."
            );
        } finally {
            isRestartingRef.current = false;
        }
    }, [startBackgroundJob]);

    // C3: Watchdog que vigila los pulsos del motor mientras el recorrido está activo
    useEffect(() => {
        if (!isSending) return;
        const watchdog = setInterval(() => {
            if (isRestartingRef.current) return;
            if (Date.now() - lastPulseRef.current > PULSE_TIMEOUT_MS) {
                restartBackgroundJob();
            }
        }, WATCHDOG_INTERVAL_MS);
        return () => clearInterval(watchdog);
    }, [isSending, restartBackgroundJob]);

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
            await startBackgroundJob();
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
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;
        sendLog("⏹️ Deteniendo proceso...");
        try {
            try {
                await BackgroundJob.stop();
            } catch (e: any) {
                sendLog(`⚠️ Error deteniendo servicio: ${e.message}`, "error");
            }
            if (busId) {
                const ok = await stopBusService(busId);
                if (!ok) {
                    sendLog("❌ No se pudo marcar isActive:false en RTDB", "error");
                }
            }
            sendLog("🛑 Proceso detenido", "success");
        } finally {
            setIsSending(false);
            isStoppingRef.current = false;
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {loadingAssignment ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>Cargando asignación...</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.statusSection}>
                            <View style={[styles.statusDot, isSending ? styles.statusDotActive : styles.statusDotInactive]} />
                            <Text style={[styles.statusText, isSending ? styles.statusTextActive : styles.statusTextInactive]}>
                                {isSending ? 'Compartiendo ubicación' : 'Detenido'}
                            </Text>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>Información del viaje</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Conductor asignado</Text>
                                <Text style={styles.infoValue}>{driverName || driverDni}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Vehículo asignado</Text>
                                <Text style={[styles.infoValue, !busId && styles.infoValueMuted]}>
                                    {busId || 'Sin asignación'}
                                </Text>
                            </View>
                        </View>

                        {!busId && !isSending && (
                            <Text style={styles.errorText}>
                                No tienes un bus asignado para hoy. Contacta a la oficina.
                            </Text>
                        )}

                        {recoveryFailed && (
                            <Text style={styles.errorText}>
                                El envío de ubicación se detuvo y no pudo recuperarse automáticamente. Presiona INICIAR para reintentar.
                            </Text>
                        )}

                        {isSending ? (
                            <Pressable
                                onPress={stopProcess}
                                style={styles.btnStop}
                            >
                                <Text style={styles.btnText}>DETENER RECORRIDO</Text>
                            </Pressable>
                        ) : (
                            <>
                                <Pressable
                                    onPress={startProcess}
                                    style={[styles.btnStart, !busId && styles.btnDisabled]}
                                    disabled={!busId}
                                >
                                    <Text style={styles.btnText}>INICIAR RECORRIDO</Text>
                                </Pressable>

                                <Pressable
                                    onPress={handleLogout}
                                    style={styles.btnLogout}
                                >
                                    <Text style={styles.btnText}>CERRAR SESIÓN</Text>
                                </Pressable>
                            </>
                        )}

                        <View style={styles.debugSection}>
                            <View style={styles.debugCard}>
                                <View style={styles.debugCardHeader}>
                                    <Text style={styles.debugTitle}>Diagnóstico técnico</Text>
                                    <Text style={styles.debugSubtitle}>
                                        Información utilizada durante la fase de validación del sistema.
                                    </Text>
                                </View>

                                <Pressable
                                    onPress={() => setShowDebug(!showDebug)}
                                    style={styles.debugToggle}
                                >
                                    <Text style={styles.debugToggleText}>
                                        {showDebug ? '▲ Ocultar diagnóstico' : '▼ Mostrar diagnóstico'}
                                    </Text>
                                </Pressable>

                                {showDebug && (
                                    <View style={styles.debugContainer}>
                                        {logs.map(log => (
                                            <View key={log.id} style={[
                                                styles.logEntry,
                                                log.type === 'error'   ? styles.logEntryError :
                                                log.type === 'success' ? styles.logEntrySuccess :
                                                                         styles.logEntryInfo
                                            ]}>
                                                <Text style={[
                                                    styles.logText,
                                                    log.type === 'error'   ? styles.logTextError :
                                                    log.type === 'success' ? styles.logTextSuccess :
                                                                             styles.logTextInfo
                                                ]}>
                                                    {log.t}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingVertical: 32,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 15,
        color: '#888',
    },
    statusSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    statusDotActive: {
        backgroundColor: '#2E7D32',
    },
    statusDotInactive: {
        backgroundColor: '#999',
    },
    statusText: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 18,
    },
    statusTextActive: {
        color: '#2E7D32',
    },
    statusTextInactive: {
        color: '#999',
    },
    infoCard: {
        backgroundColor: COLORS.background,
        borderRadius: 14,
        padding: 18,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E8E8E8',
        elevation: 1,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    cardHeader: {
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E8E8E8',
    },
    cardTitle: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 15,
        color: COLORS.textTitle,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    infoLabel: {
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        color: '#999',
    },
    infoValue: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 15,
        color: COLORS.textTitle,
    },
    infoValueMuted: {
        color: '#999',
        fontFamily: TYPOGRAPHY.primary.regular,
    },
    divider: {
        height: 1,
        backgroundColor: '#F0F0F0',
        marginVertical: 2,
    },
    errorText: {
        color: '#d32f2f',
        textAlign: 'center',
        marginBottom: 16,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        lineHeight: 18,
    },
    btnStart: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
        elevation: 2,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
    },
    btnStop: {
        backgroundColor: '#d32f2f',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
        elevation: 2,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
    },
    btnLogout: {
        backgroundColor: '#d32f2f',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        color: COLORS.white,
        fontFamily: TYPOGRAPHY.primary.bold,
        fontSize: 16,
    },
    debugSection: {
        marginTop: 12,
    },
    debugCard: {
        backgroundColor: COLORS.background,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E8E8E8',
        overflow: 'hidden',
        elevation: 1,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    debugCardHeader: {
        padding: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F5F5F5',
    },
    debugTitle: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 14,
        color: COLORS.textTitle,
        marginBottom: 4,
    },
    debugSubtitle: {
        fontFamily: TYPOGRAPHY.primary.regular,
        fontSize: 11,
        color: '#999',
        lineHeight: 16,
    },
    debugToggle: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    debugToggleText: {
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 12,
        color: '#888',
    },
    debugContainer: {
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    logEntry: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        marginBottom: 3,
    },
    logEntryInfo: {
        backgroundColor: '#F8F9FA',
    },
    logEntrySuccess: {
        backgroundColor: '#F0FFF4',
    },
    logEntryError: {
        backgroundColor: '#FFF5F5',
    },
    logText: {
        fontFamily: 'monospace',
        fontSize: 11,
    },
    logTextInfo: {
        color: '#555',
    },
    logTextSuccess: {
        color: '#2E7D32',
    },
    logTextError: {
        color: '#C62828',
    },
});
