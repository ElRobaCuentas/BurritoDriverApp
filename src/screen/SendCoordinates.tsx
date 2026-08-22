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
import { pause, withTimeout } from '../shared/utils/timeout';

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

// T4.1: Heartbeat de presencia. Cuando el GPS no emite (bus quieto, sin
// superar distanceFilter), el heartbeat mantiene fresco el timestamp en RTDB
// escribiendo la última posición conocida. Menor que PULSE_TIMEOUT_MS para
// que el watchdog no interprete el bus estacionado como servicio muerto.
const HEARTBEAT_INTERVAL_MS = 8000;

// C4.3: Timeout y reintentos al cargar la asignación.
// El timeout cubre el intento COMPLETO (lectura de chofer + lectura de asignación).
const ASSIGNMENT_TIMEOUT_MS = 10000;
const ASSIGNMENT_RETRIES = 2;
const ASSIGNMENT_RETRY_PAUSE_MS = 1500;

const locationTask = async (taskDataArguments: any) => {
    // T11: Rescatamos también el busId inyectado
    const { uidChofer, busId } = taskDataArguments; 
    sendLog(`🚀 MOTOR: ¡VIVO CON CHOFER ${uidChofer.substring(0,6)}...!`, "success");

    return new Promise<void>((resolve) => {
        // T4.1: Última posición conocida y último intento de escritura a RTDB.
        // lastWriteAt se fija al INTENTAR escribir (antes del await) y se
        // resetea en fallo, para que el heartbeat no descarte fuegos ni
        // duplique escrituras cuando el GPS ya emitió hace poco.
        let lastLocation: { latitude: number; longitude: number; heading: number; speed: number } | null = null;
        let lastWriteAt = 0;

        // T4.1: Única ruta de escritura a RTDB. Tanto el callback del GPS como
        // el heartbeat pasan por aquí para no divergir (una sola
        // responsabilidad de escribir en Firebase).
        const writeLocation = async (coords: { latitude: number; longitude: number; heading: number; speed: number }) => {
            try {
                // T4.1: lastWriteAt se fija ANTES del await (instante del intento).
                // Antes se fijaba tras el éxito: el siguiente fuego del heartbeat
                // (~8004 ms después) quedaba por debajo de HEARTBEAT_INTERVAL_MS y
                // se descartaba → patrón real escribir → saltar → escribir (≈16 s).
                lastWriteAt = Date.now();
                // T11: Usamos updateBusLocation con la placa dinámica
                await updateBusLocation(busId, {
                    ...coords,
                    timestamp: Date.now(),
                });
                return true;
            } catch (err: any) {
                // T4.1: El intento fallido no cuenta como escritura reciente:
                // se resetea para que el próximo fuego del heartbeat reintente
                // (≈8 s), sin cola ni escrituras duplicadas.
                lastWriteAt = 0;
                sendLog(`❌ FALLO FIREBASE: ${err.message}`, "error");
                return false;
            }
        };

        const watchId = Geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;
                const coords = {
                    latitude,
                    longitude,
                    heading: heading ?? 0,
                    speed: speed ?? 0,
                };
                lastLocation = coords;
                // C3: Pulso de vida hacia la UI (mismo canal que el debug panel)
                DeviceEventEmitter.emit('PRO_LOCATION_PULSE', { ts: Date.now() });
                sendLog(`✅ POSICIÓN: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");

                sendLog("☁️ Subiendo a Firebase...");
                const ok = await writeLocation(coords);
                if (ok) {
                    sendLog("✅ FIREBASE ACTUALIZADO", "success");
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

        // T4.1: Heartbeat de presencia. Mantiene fresco el timestamp en RTDB
        // cuando el GPS no emite (bus quieto, sin superar distanceFilter).
        // Escribe la última posición conocida solo si no hubo otra escritura
        // reciente, para no duplicar el trabajo del GPS.
        const heartbeat = setInterval(() => {
            if (!lastLocation) {
                return;
            }
            if (Date.now() - lastWriteAt < HEARTBEAT_INTERVAL_MS) {
                return;
            }
            // C3: El pulso también vale como señal de vida hacia la UI,
            // aunque la escritura falle (sin red, por ejemplo).
            DeviceEventEmitter.emit('PRO_LOCATION_PULSE', { ts: Date.now() });
            sendLog(`💓 HEARTBEAT: ${lastLocation.latitude.toFixed(5)}, ${lastLocation.longitude.toFixed(5)}`, "info");
            writeLocation(lastLocation);
        }, HEARTBEAT_INTERVAL_MS);

        const keepAlive = setInterval(() => {
            if (!BackgroundJob.isRunning()) {
                Geolocation.clearWatch(watchId);
                clearInterval(keepAlive);
                clearInterval(heartbeat);
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

    // C4.3: Estados y guards de la carga de asignación
    const [assignmentError, setAssignmentError] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const fetchGenRef = useRef(0);
    const isLoadingAssignmentRef = useRef(false);

    const [showDebug, setShowDebug] = useState(true);

    // C4.3: Carga de la asignación con timeout por intento completo y reintento acotado.
    // Cada i ntento corre dentro de ASSIGNMENT_TIMEOUT_MS y cubre ambas lecturas de Firebase
    // (chofer + asignación) con un solo reloj. El guard de generación (fetchGenRef) ignora
    // respuestas tardías de un intento vencido para que no sobrescriban un ciclo más nuevo
    // (Promise.race no cancela la consulta, solo deja de esperarla).
    const loadAssignment = useCallback(async () => {
        if (isLoadingAssignmentRef.current) return;
        isLoadingAssignmentRef.current = true;
        const gen = ++fetchGenRef.current;
        setLoadingAssignment(true);
        setAssignmentError(false);
        setRetrying(false);
        try {
            for (let intento = 1; intento <= ASSIGNMENT_RETRIES; intento++) {
                if (gen !== fetchGenRef.current) return;
                if (intento > 1) {
                    setRetrying(true);
                    sendLog(`⚠️ Problemas de conexión, reintentando (${intento}/${ASSIGNMENT_RETRIES})...`, "error");
                    await pause(ASSIGNMENT_RETRY_PAUSE_MS);
                    if (gen !== fetchGenRef.current) return;
                }
                try {
                    const r = await withTimeout((async () => {
                        const d = new Date();
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const today = `${year}-${month}-${day}`;

                        let name: string | null = null;
                        try {
                            const choferSnapshot = await database().ref(`/choferes/${driverDni}`).once('value');
                            if (choferSnapshot.exists()) {
                                const chofer = choferSnapshot.val();
                                name = `${chofer.nombre} ${chofer.apellidos}`.trim();
                            }
                        } catch (e: any) {
                            // El nombre es opcional: su fallo no debe tumbar el intento.
                            // Se loguea solo si este intento sigue siendo el actual.
                            if (gen === fetchGenRef.current) {
                                sendLog(`❌ Error consultando nombre del conductor: ${e.message}`, "error");
                            }
                        }

                        const snapshot = await database().ref('/asignaciones')
                            .orderByChild('choferId')
                            .equalTo(driverDni)
                            .once('value');

                        let foundBusId: string | null = null;
                        let foundAsignacionId: string | null = null;
                        if (snapshot.exists()) {
                            snapshot.forEach((child) => {
                                const val = child.val();
                                if (val.fecha === today && val.activo === true) {
                                    foundBusId = val.busId;
                                    foundAsignacionId = child.key;
                                }
                                return undefined;
                            });
                        }
                        return { name, foundBusId, foundAsignacionId };
                    })(), ASSIGNMENT_TIMEOUT_MS);

                    if (gen !== fetchGenRef.current) return;
                    // Resultado aplicado solo si seguimos siendo la generación actual
                    setDriverName(r.name);
                    if (r.name) {
                        sendLog(`👤 Conductor identificado: ${r.name}`, "success");
                    } else {
                        sendLog(`⚠️ Sin registro en choferes, se usará el DNI (${driverDni})`, "error");
                    }
                    setBusId(r.foundBusId);
                    setAsignacionId(r.foundAsignacionId);
                    if (r.foundBusId) {
                        sendLog(`🚌 Bus asignado: ${r.foundBusId}`, "success");
                    } else {
                        // Resultado válido: Firebase respondió y no hay asignación. No se reintenta.
                        sendLog(`❌ No hay asignación para hoy.`, "error");
                    }
                    setLoadingAssignment(false);
                    return;
                } catch (e: any) {
                    if (gen !== fetchGenRef.current) return;
                    sendLog(`❌ Intento ${intento}/${ASSIGNMENT_RETRIES} falló: ${e.message}`, "error");
                }
            }
            if (gen !== fetchGenRef.current) return;
            // Se agotaron los reintentos: salir del spinner y mostrar la tarjeta de error
            setLoadingAssignment(false);
            setAssignmentError(true);
        } finally {
            // Regla del equipo: liberar el guard en TODOS los caminos (éxito, timeout,
            // error, retorno temprano). Si quedara en true, REINTENTAR dejaría de funcionar.
            isLoadingAssignmentRef.current = false;
        }
    }, [driverDni]);

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
        // loadAssignment() porque únicamente restaura el estado del motor: no depende
        // de Firebase ni modifica la asignación. isRunning() conserva true cuando el
        // proceso y el singleton JS sobrevivieron al cierre de la app.
        if (BackgroundJob.isRunning()) {
            setLogs([]);
            lastPulseRef.current = Date.now();
            setRecoveryFailed(false);
            setIsSending(true);
            sendLog("ℹ️ Recorrido restaurado: el servicio seguía activo en segundo plano", "success");
        }

        // C4.3: Carga de la asignación con timeout y reintento acotado (ver loadAssignment)
        loadAssignment();

        return () => {
            logSubscription.remove();
            pulseSubscription.remove();
            appStateSub.remove();
        };
    }, [driverDni, loadAssignment]);

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
                        <Text style={styles.loadingText}>
                            {retrying ? 'Problemas de conexión. Reintentando…' : 'Cargando asignación...'}
                        </Text>
                    </View>
                ) : assignmentError ? (
                    // C4.3: Se agotaron los reintentos — tarjeta visible, nunca atrapar al conductor.
                    // CERRAR SESIÓN siempre accesible. REINTENTAR dispara un nuevo ciclo de 2 intentos.
                    <View style={styles.errorCard}>
                        <Text style={styles.errorTitle}>No se pudo cargar tu asignación</Text>
                        <Text style={styles.errorSubtitle}>
                            Verifica tu conexión a Internet e inténtalo nuevamente.
                        </Text>
                        <Pressable
                            onPress={loadAssignment}
                            style={styles.btnStart}
                        >
                            <Text style={styles.btnText}>REINTENTAR</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleLogout}
                            style={styles.btnLogout}
                        >
                            <Text style={styles.btnText}>CERRAR SESIÓN</Text>
                        </Pressable>
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
    // C4.3: Tarjeta visible cuando se agotan los reintentos de carga de asignación
    errorCard: {
        alignItems: 'center',
        marginVertical: 24,
        padding: 20,
        borderRadius: 12,
        backgroundColor: '#FFF4F4',
        borderWidth: 1,
        borderColor: '#FFCDD2',
    },
    errorTitle: {
        color: '#d32f2f',
        fontFamily: TYPOGRAPHY.primary.bold,
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    errorSubtitle: {
        color: '#555',
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
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
