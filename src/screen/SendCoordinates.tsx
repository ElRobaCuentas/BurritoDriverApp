import { useEffect, useState, useRef } from 'react';
import {
    Alert,
    Linking,
    Platform,
    PermissionsAndroid,
    Pressable,
    StyleSheet,
    Text,
    View,
    ActivityIndicator,
} from 'react-native';
import { MyCustomHeader } from '../components/header/MyCustomHeader';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import BackgroundJob from 'react-native-background-actions';
import Geolocation, { GeolocationResponse } from '@react-native-community/geolocation';

// ─── Configuraciones Core ──────────────────────────────────────────────────────
const SEND_INTERVAL_MS = 3000; 
const GPS_TIMEOUT_MS = 2500; 

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const getCurrentPositionAsync = (): Promise<GeolocationResponse> =>
    new Promise((resolve, reject) =>
        Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GPS_TIMEOUT_MS, 
            maximumAge: 0,           
        })
    );

const backgroundOptions = {
    taskName: 'BurritoTracker',
    taskTitle: 'El Burrito está en ruta 🚌',
    taskDesc: 'Transmitiendo ubicación en tiempo real...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: SEND_INTERVAL_MS },
};

// ─── Task de background: POLLING ACTIVO (Limpio y sin Antipatrones) ────────────
const locationTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;

    while (BackgroundJob.isRunning()) {
        try {
            // 1. Intentamos leer el hardware GPS
            const position = await getCurrentPositionAsync();
            const { latitude, longitude, heading, speed } = position.coords;

            // 2. Enviamos a Firebase (Persistencia offline lo protege sin internet)
            await updateBurritoLocation({
                latitude,
                longitude,
                heading: heading ?? 0,
                speed:   speed   ?? 0,
            });
            console.log(`🛰️ OK: lat: ${latitude.toFixed(5)}, lng: ${longitude.toFixed(5)}`);
            
        } catch (err: any) {
            // 3. Captura exclusiva de errores de satélite GPS
            console.log('⚠️ Buscando satélites GPS...', err.message || err);
        }
        
        await sleep(delay);
    }
};

// ─── Componente ────────────────────────────────────────────────────────────────
export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    
    // Candado Síncrono MutEx
    const lockRef = useRef(false);
    const [isUIProcessing, setIsUIProcessing] = useState(false); 
    const hasShownBatteryAlert = useRef(false);

    // ── Permisos ────────────────────────────────────────────────────────────────
    const checkPermissionsSilently = async () => {
        if (Platform.OS !== 'android') return;
        try {
            await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            ]);
        } catch (err) { /* silent fail */ }
    };

    const requestPermissionsForStart = async (): Promise<boolean> => {
        if (Platform.OS !== 'android') return true;
        try {
            const base = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            ]);

            if (base[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert('Permiso necesario', 'El Burrito necesita acceso a tu ubicación.');
                return false;
            }

            if (Platform.Version >= 29) {
                const bgGranted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
                    {
                        title: 'Ubicación de Fondo',
                        message: 'Requerido para transmitir con pantalla apagada.',
                        buttonPositive: 'Permitir siempre',
                    }
                );

                if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Advertencia', 'Sin permiso de fondo, el GPS morirá al bloquear el celular.',
                        [{ text: 'Abrir ajustes', onPress: () => Linking.openSettings() }, { text: 'Ignorar' }]
                    );
                }
            }

            if (!hasShownBatteryAlert.current) {
                requestBatteryOptimizationExemption();
                hasShownBatteryAlert.current = true;
            }
            return true;
        } catch (err) {
            return false;
        }
    };

    const requestBatteryOptimizationExemption = () => {
        if (Platform.OS !== 'android' || Platform.Version < 23) return;
        Alert.alert(
            '🔋 Optimización de batería',
            'Selecciona "Sin restricciones" para que el viaje no se corte.',
            [
                { text: 'Ajustes', onPress: () => Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => Linking.openSettings()) },
                { text: 'Listo', style: 'cancel' },
            ]
        );
    };

    useEffect(() => { checkPermissionsSilently(); }, []);

    // ── Lógica Core con MutEx Guard ─────────────────────────────────────────────
    const startProcess = async () => {
        if (lockRef.current || BackgroundJob.isRunning()) return; 
        
        lockRef.current = true;
        setIsUIProcessing(true);
        setStatusMsg('Iniciando sistema...');

        const hasPermission = await requestPermissionsForStart();
        
        if (!hasPermission) {
            lockRef.current = false;
            setIsUIProcessing(false);
            setStatusMsg('');
            return;
        }

        try {
            await BackgroundJob.start(locationTask, backgroundOptions);
            if (!BackgroundJob.isRunning()) throw new Error("Bloqueado por OS");
            
            setIsSending(true);
            setStatusMsg('Transmitiendo en vivo');
        } catch (e) {
            Alert.alert('Error', 'El sistema bloqueó el servicio.');
            setIsSending(false);
            setStatusMsg('');
        } finally {
            lockRef.current = false;
            setIsUIProcessing(false);
        }
    };

    const stopProcess = async () => {
        if (lockRef.current || !BackgroundJob.isRunning()) return; 
        
        lockRef.current = true;
        setIsUIProcessing(true);
        setStatusMsg('Apagando motores...');

        try {
            await Promise.allSettled([
                BackgroundJob.stop(),
                stopBurritoService()
            ]);
            setIsSending(false);
            setStatusMsg('');
        } finally {
            lockRef.current = false;
            setIsUIProcessing(false);
        }
    };

    // ── UI ────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <MyCustomHeader title=" DRIVER APP " />
            <View style={styles.body}>
                
                <View style={styles.statusBadge}>
                    <View style={[styles.dot, { backgroundColor: isSending ? '#4caf50' : '#f44336' }]} />
                    <Text style={styles.statusText}>
                        {isUIProcessing ? statusMsg : (isSending ? 'Servicio activo' : 'Servicio detenido')}
                    </Text>
                    {isUIProcessing && <ActivityIndicator size="small" color="#2060cd" style={{marginLeft: 10}}/>}
                </View>

                <Pressable
                    disabled={isSending || isUIProcessing}
                    onPress={startProcess}
                    style={[styles.button, { backgroundColor: (isSending || isUIProcessing) ? '#e0e0e0' : '#2060cd' }]}
                >
                    <Text style={[styles.btnText, {color: (isSending || isUIProcessing) ? '#9e9e9e' : 'white'}]}>
                        🚀 INICIAR RUTA
                    </Text>
                </Pressable>

                <Pressable
                    disabled={!isSending || isUIProcessing}
                    onPress={stopProcess}
                    style={[styles.button, { backgroundColor: (!isSending || isUIProcessing) ? '#e0e0e0' : '#d32f2f' }]}
                >
                    <Text style={[styles.btnText, {color: (!isSending || isUIProcessing) ? '#9e9e9e' : 'white'}]}>
                        ⏹ DETENER RUTA
                    </Text>
                </Pressable>

                <Text style={styles.hint}>
                    💡 La pantalla puede apagarse, la transmisión continuará.
                </Text>
            </View>
        </View>
    );
};

// ─── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, backgroundColor: '#f5f5f5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { fontSize: 14, color: '#333', fontWeight: '600' },
    button: { padding: 18, borderRadius: 30, marginBottom: 15, width: '100%', alignItems: 'center', elevation: 2 },
    btnText: { fontWeight: 'bold', fontSize: 16 },
    hint: { marginTop: 24, fontSize: 12, color: '#888', textAlign: 'center', paddingHorizontal: 20 },
});