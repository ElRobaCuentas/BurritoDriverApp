import React, { useEffect, useState, useRef } from 'react';
import { AppState, Alert, Platform, PermissionsAndroid, Pressable, StyleSheet, Text, View } from 'react-native';
import { MyCustomHeader } from '../components/header/MyCustomHeader';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import BackgroundJob from 'react-native-background-actions';
import Geolocation, { GeolocationResponse } from '@react-native-community/geolocation';

const SEND_INTERVAL_MS = 3000; 
const GPS_TIMEOUT_MS   = 3000; 
const MAX_AGE_MS       = 4000; 

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
    taskTitle: 'El Burrito está en ruta',
    taskDesc: 'Transmitiendo ubicación...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: SEND_INTERVAL_MS },
    ongoing: true, 
};

const locationTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;
    let lastLat = 0;
    let lastLng = 0;
    let iteration = 1;
    let lastTime = Date.now();

    console.log(`\n🚀 [SISTEMA]: INICIANDO BACKGROUND TASK...`);

    while (BackgroundJob.isRunning()) {
        const now = Date.now();
        const delta = (now - lastTime) / 1000;
        
        console.log(`\n=========================================`);
        console.log(`[RELOJ JS]: Iteración #${iteration} | Diferencia: ${delta.toFixed(3)}s`);
        
        lastTime = now;
        iteration++;

        try {
            console.log(`[GPS]: Solicitando coordenadas...`);
            const position = await getCurrentPositionAsync();
            lastLat = position.coords.latitude;
            lastLng = position.coords.longitude;
            console.log(`ÉXITO -> lat:${lastLat.toFixed(4)}, lng:${lastLng.toFixed(4)}`);

            console.log(`[FIREBASE]: Enviando a la nube...`);
            await updateBurritoLocation({
                latitude: lastLat,
                longitude: lastLng,
                heading: position.coords.heading ?? 0,
                speed: position.coords.speed ?? 0,
            });
            console.log(`[FIREBASE]: ÉXITO -> Datos guardados.`);
            
        } catch (err: any) {
            console.log(`[ERROR GPS]: Fallo ->`, err.message);
            if (lastLat !== 0) {
                console.log(`[LATIDO]: Rescate a Firebase...`);
                await updateBurritoLocation({ latitude: lastLat, longitude: lastLng, heading: 0, speed: 0 });
            }
        }
        await sleep(delay);
    }
    console.log(`[SISTEMA]: BACKGROUND TASK DETENIDA.`);
};

export const SendCoordinates = () => {
    const [isSending, setIsSending] = useState(false);
    const lockRef = useRef(false);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            console.log(`\n [ESTADO APP]: -> ${nextAppState.toUpperCase()}`);
        });
        return () => subscription.remove();
    }, []);

    const requestUniversalPermissions = async (): Promise<boolean> => {
        if (Platform.OS !== 'android') return true;

        try {
            // 1. Permiso de Notificaciones 
            if (Platform.Version >= 33) {
                const notifGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Aviso', 'Sin permiso de notificaciones, Android matará la app en segundo plano.');
                    return false;
                }
            }

            // 2. Permiso de GPS Frontal
            const gpsGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            if (gpsGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert('Error', 'Necesitas conceder permisos de ubicación.');
                return false;
            }

            // 3. Permiso de GPS en Segundo Plano 
            if (Platform.Version >= 29) {
                const bgGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
                if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Advertencia', 'Sin permiso "Todo el tiempo", el GPS podría congelarse al apagar la pantalla.');
                }
            }

            return true;
        } catch (err) {
            console.log("Error pidiendo permisos:", err);
            return false;
        }
    };

    const startProcess = async () => {
        if (lockRef.current || BackgroundJob.isRunning()) return; 
        lockRef.current = true;
        
        console.log(`\n [UI]: Validando permisos...`);
        const hasPermissions = await requestUniversalPermissions();
        
        if (!hasPermissions) {
            console.log(`[UI ERROR]: Permisos denegados. Abortando misión.`);
            lockRef.current = false;
            return;
        }

        console.log(`[UI]: Permisos OK. Arrancando motor...`);
        try {
            await BackgroundJob.start(locationTask, backgroundOptions);
            setIsSending(true);
        } catch (e: any) {
            console.log(`[UI ERROR CRÍTICO]:`, e.message);
            Alert.alert('Error', 'El celular bloqueó el servicio.');
        } finally {
            lockRef.current = false;
        }
    };

    const stopProcess = async () => {
        if (lockRef.current || !BackgroundJob.isRunning()) return; 
        lockRef.current = true;
        
        console.log(`\n⏹[UI]: Deteniendo...`);
        try {
            await Promise.allSettled([BackgroundJob.stop(), stopBurritoService()]);
            setIsSending(false);
        } finally {
            lockRef.current = false;
        }
    };

    return (
        <View style={styles.container}>
            <MyCustomHeader title=" DEBUG DRIVER " />
            <View style={styles.body}>
                <Pressable onPress={startProcess} style={[styles.button, { backgroundColor: isSending ? '#4caf50' : '#2060cd' }]}>
                    <Text style={styles.btnText}>{isSending ? '🚌 TRANSMITIENDO...' : '🚀 INICIAR DEBUG'}</Text>
                </Pressable>
                <Pressable disabled={!isSending} onPress={stopProcess} style={[styles.button, { backgroundColor: !isSending ? '#555' : '#d32f2f' }]}>
                    <Text style={styles.btnText}>⏹ DETENER DEBUG</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    button: { padding: 18, borderRadius: 30, marginBottom: 15, width: '100%', alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});