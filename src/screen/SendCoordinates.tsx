import React, { useEffect, useState, useRef } from 'react';
import { 
    AppState, PermissionsAndroid, 
    Pressable, StyleSheet, Text, View, ScrollView,
    DeviceEventEmitter 
} from 'react-native';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import BackgroundJob from 'react-native-background-actions';
import Geolocation, { GeolocationResponse } from '@react-native-community/geolocation';

const SEND_INTERVAL_MS = 3000;
const GPS_TIMEOUT_MS   = 10000;
const MAX_AGE_MS       = 4000;

//ESTA FUNCION NO VA EJECUTAR NADA EN EL TIMEOUT SOLO EL "resolve vacio" PARA CUANDO SE EJECUTA LE DIGA AL AWAIT Q CONTINUE (este es una artificio)
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
            timeout: GPS_TIMEOUT_MS, //Si en ese tiempo no hay respuesta se cancela la peticion
            maximumAge: MAX_AGE_MS, //Para no aceptar localizacion de cache de mas de 4 segundos
        })
    );

const locationTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments; //Es el tiempo de espera q definimos para la proxima solicitud de ubicacion
    let iteration = 1;
    
    sendLog("🚀 MOTOR: ¡VIVO Y CORRIENDO!", "success");

    while (BackgroundJob.isRunning()) {
        sendLog(`⏱️ Iteración #${iteration}`);
        iteration++;
        let position; // Declaramos la variable afuera para usarla en el segundo bloque

        // --- BLOQUE 1: INTENTAR OBTENER GPS ---
        try {
            sendLog("🛰️ Consultando sensor GPS...");
            position = await getCurrentPositionAsync();
            const { latitude, longitude } = position.coords;
            sendLog(`✅ POSICIÓN: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");
        } catch (err: any) {
            sendLog(`❌ FALLO GPS - X: ${err.message}`, "error");
            await sleep(delay);
            continue; //Para abortar esta iteracion y pasar al siguiente
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
            sendLog("✅ FIREBASE ACTUALIZADO - X", "success");
        } catch (err: any) {
            // Si llegamos aquí, sabemos 100% que el GPS funcionó, pero el internet/Firebase falló
            sendLog(`❌ FALLO FIREBASE: ${err.message}`, "error");
        }

        await sleep(delay); //AQUI ESPERAMOS EL TIEMPO DEL DELAY PARA PASAR A LA SIGUIENTE LINEA O INTERACION
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

export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        //Creamos un evento listener: para escuchar y setear los logs enviados acumulandose en un estate
        const logSubscription = DeviceEventEmitter.addListener('PRO_DEBUG_LOG', (newLog) => {
            setLogs(prev => [...prev, newLog].slice(-30)); 
        });

        //Eventos que escucha la APP si esta en primer o segundo plano (active o background)
        const appStateSub = AppState.addEventListener('change', (state) => {
            sendLog(`📱 APP STATE: ${state.toUpperCase()}`);
        });

        return () => {
            //Destruimos los eventos cuando salimos del componente
            logSubscription.remove(); 
            appStateSub.remove();
        };
    }, []);

    const startProcess = async () => {
        if (BackgroundJob.isRunning()) return;
        
        setLogs([]); 
        sendLog("▶️ Botón presionado: Iniciando...", "info");

        try {
            sendLog("🛡️ Verificando permisos...");
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );

            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                sendLog("❌ PERMISO DENEGADO", "error");
                return;
            }

            sendLog("⚙️ Arrancando Background Service...");
            await BackgroundJob.start(locationTask, backgroundOptions);
            setIsSending(true);
            sendLog("✅ TODO OK: Revisa la terminal", "success");
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
                            log.type === 'error' ? {color: '#cc0000'} : 
                            log.type === 'success' ? {color: '#008800'} : {color: '#000000'}
                        ]}>
                            {log.t}
                        </Text>
                    ))}
                </ScrollView>
            </View>

            <View style={styles.buttons}>
                <Pressable onPress={startProcess} style={[styles.btn, {backgroundColor: isSending ? '#888' : '#2060cd'}]}>
                    <Text style={styles.btnText}>{isSending ? '🚌 TRANSMITIENDO...' : '🚀 INICIAR DEBUG'}</Text>
                </Pressable>
                
                <Pressable onPress={stopProcess} style={[styles.btn, {backgroundColor: '#d32f2f'}]}>
                    <Text style={styles.btnText}>⏹ DETENER TODO</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' }, // FONDO BLANCO
    mainTitle: { fontSize: 20, fontWeight: 'bold', color: '#000', textAlign: 'center', marginTop: 20 },
    console: { 
        flex: 1, 
        backgroundColor: '#F5F5F5', 
        margin: 15, 
        padding: 10, 
        borderWidth: 4, 
        borderColor: '#FF0000', // BORDE ROJO GIGANTE
        borderRadius: 5,
    },
    consoleTitle: { color: '#000', fontSize: 14, fontWeight: 'bold', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#CCC' },
    scroll: { flex: 1 },
    logLine: { fontFamily: 'monospace', fontSize: 12, marginBottom: 4 },
    buttons: { padding: 20 },
    btn: { padding: 20, borderRadius: 10, marginBottom: 10, alignItems: 'center', elevation: 5 },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});