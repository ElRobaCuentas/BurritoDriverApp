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

// ─── CONFIGURACIÓN MATEMÁTICA EXACTA (GEMINI + CLAUDE + INVESTIGACIÓN) ─────────
const SEND_INTERVAL_MS = 3000; // 🚌 3s: Fluidez total (Investigación UNMSM)
const GPS_TIMEOUT_MS   = 3000; // ⏱️ 3s: Límite de espera para el hardware
const MAX_AGE_MS       = 4000; // 🛡️ 4s: Inercia para túneles y respuesta rápida

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const getCurrentPositionAsync = (): Promise<GeolocationResponse> =>
    new Promise((resolve, reject) =>
        Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GPS_TIMEOUT_MS, 
            maximumAge: MAX_AGE_MS, 
        })
    );

const backgroundOptions = {
    taskName: 'BurritoTracker',
    taskTitle: 'El Burrito está en ruta 🚌',
    taskDesc: 'Transmitiendo ubicación en tiempo real...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: SEND_INTERVAL_MS },
    ongoing: true, // 🔥 Notificación fijada al sistema (No deslizable)
    linkingURI: 'burritodriver://', 
};

// ─── TASK DE FONDO: EL MOTOR INMORTAL ─────────────────────────────────────────
const locationTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;
    let lastLat = 0;
    let lastLng = 0;

    while (BackgroundJob.isRunning()) {
        try {
            const position = await getCurrentPositionAsync();
            lastLat = position.coords.latitude;
            lastLng = position.coords.longitude;

            await updateBurritoLocation({
                latitude: lastLat,
                longitude: lastLng,
                heading: position.coords.heading ?? 0,
                speed: position.coords.speed ?? 0,
            });
            console.log(`GPS OK`);
            
        } catch (err: any) {
            // LATIDO DE RESPALDO: Si pierde satélites (Túneles o Interiores)
            if (lastLat !== 0) {
                await updateBurritoLocation({
                    latitude: lastLat,
                    longitude: lastLng,
                    heading: 0, 
                    speed: 0,   
                });
                console.log('💓 Latido: Manteniendo el bus vivo en Firebase');
            }
        }
        await sleep(delay);
    }
};

// ─── COMPONENTE UI: CON DEFENSAS DE BATERÍA RESTAURADAS ────────────────────────
export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const lockRef = useRef(false);
    const [isUIProcessing, setIsUIProcessing] = useState(false); 
    
    // 🔥 RESTAURADO: Control para no spamear la alerta de batería
    const hasShownBatteryAlert = useRef(false);

    // 🔥 RESTAURADO: Alerta automática al abrir la pantalla
    useEffect(() => {
        if (!hasShownBatteryAlert.current && Platform.OS === 'android') {
            Alert.alert(
                '🔋 Optimización de batería',
                'Para que el GPS no se apague al bloquear la pantalla, selecciona "Sin restricciones" en los ajustes.',
                [
                    {
                        text: 'Ir a Ajustes',
                        onPress: () => Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')
                                         .catch(() => Linking.openSettings())
                    },
                    { text: 'Ya lo hice', style: 'cancel' }
                ]
            );
            hasShownBatteryAlert.current = true;
        }
    }, []);

    const requestPermissionsForStart = async (): Promise<boolean> => {
        if (Platform.OS !== 'android') return true;
        try {
            const base = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            ]);
            
            if (base[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert('Error', 'Necesitas conceder permisos de ubicación.');
                return false;
            }

            if (Platform.Version >= 29) {
                const bgGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
                if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Aviso', 'El GPS podría fallar con la pantalla apagada si no das permiso "Todo el tiempo".');
                }
            }
            return true;
        } catch (err) { return false; }
    };

    const startProcess = async () => {
        if (lockRef.current || BackgroundJob.isRunning()) return; 
        lockRef.current = true;
        setIsUIProcessing(true);
        setStatusMsg('Verificando satélites...');

        if (!(await requestPermissionsForStart())) {
            lockRef.current = false;
            setIsUIProcessing(false);
            setStatusMsg('');
            return;
        }

        try {
            await BackgroundJob.start(locationTask, backgroundOptions);
            setIsSending(true);
            setStatusMsg('Transmitiendo en vivo 🚌');
        } catch (e) {
            Alert.alert('Error', 'El celular bloqueó el servicio en segundo plano.');
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
        setStatusMsg('Deteniendo transmisión...');
        try {
            await Promise.allSettled([BackgroundJob.stop(), stopBurritoService()]);
            setIsSending(false);
            setStatusMsg('');
        } finally {
            lockRef.current = false;
            setIsUIProcessing(false);
        }
    };

    return (
        <View style={styles.container}>
            <MyCustomHeader title=" BURRITO DRIVER " />
            <View style={styles.body}>
                <View style={styles.statusBadge}>
                    <View style={[styles.dot, { backgroundColor: isSending ? '#4caf50' : '#f44336' }]} />
                    <Text style={styles.statusText}>
                        {isUIProcessing ? statusMsg : (isSending ? 'SISTEMA ACTIVO' : 'SISTEMA APAGADO')}
                    </Text>
                    {isUIProcessing && <ActivityIndicator size="small" color="#2060cd" style={{marginLeft: 10}}/>}
                </View>

                <Pressable disabled={isSending || isUIProcessing} onPress={startProcess} style={[styles.button, { backgroundColor: (isSending || isUIProcessing) ? '#ccc' : '#2060cd' }]}>
                    <Text style={styles.btnText}>🚀 INICIAR RUTA</Text>
                </Pressable>

                <Pressable disabled={!isSending || isUIProcessing} onPress={stopProcess} style={[styles.button, { backgroundColor: (!isSending || isUIProcessing) ? '#ccc' : '#d32f2f' }]}>
                    <Text style={styles.btnText}>⏹ DETENER RUTA</Text>
                </Pressable>

                <Text style={styles.hint}>
                    💡 Puedes apagar la pantalla. La ruta seguirá transmitiéndose.
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, backgroundColor: '#f5f5f5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { fontSize: 13, fontWeight: 'bold', color: '#333' },
    button: { padding: 18, borderRadius: 30, marginBottom: 15, width: '100%', alignItems: 'center', elevation: 2 },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    hint: { marginTop: 24, fontSize: 12, color: '#888', textAlign: 'center', paddingHorizontal: 20 },
});