import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, PermissionsAndroid, Platform } from 'react-native';
import { MyCustomHeader } from '../components/header/MyCustomHeader';
import { updateBurritoLocation, stopBurritoService } from '../services/firebase_service';
import Geolocation from '@react-native-community/geolocation';

import BackgroundJob from 'react-native-background-actions';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

const backgroundOptions = {
    taskName: 'BurritoTracker',
    taskTitle: 'El Burrito está en ruta 🚌',
    taskDesc: 'Transmitiendo ubicación en tiempo real...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { delay: 3000 },
};

export const SendCoordinates = () => {
  const [isSending, setIsSending] = useState<boolean>(false); 
  const watchIdRef = useRef<number | null>(null);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
        try {
            const granted = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, 
            ]);

            if (granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED) {
                if (Platform.Version >= 29) { // Android 10+
                    const backgroundGranted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
                        {
                            title: "Ubicación en Segundo Plano",
                            message: "El Burrito necesita acceder a la ubicación incluso cuando la app está cerrada para que los estudiantes puedan ver por dónde vas.",
                            buttonPositive: "Permitir siempre"
                        }
                    );
                    if (backgroundGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                        console.warn("Permiso de segundo plano denegado. El GPS morirá si se apaga la pantalla.");
                    }
                }
            }
        } catch (err) {
            console.warn("Error pidiendo permisos:", err);
        }
    }
  };

  useEffect(() => {
      requestPermissions();
  }, []);

  const locationTask = async (taskDataArguments: any) => {
      await new Promise<void>(async (resolve) => {
          
          watchIdRef.current = Geolocation.watchPosition(
              async (position) => {
                  const { latitude, longitude, heading, speed } = position.coords;
                  
                  await updateBurritoLocation({
                      latitude,
                      longitude,
                      heading: heading || 0, 
                      speed: speed || 0      
                  });
                  console.log('🛰️ Enviando GPS:', latitude, longitude);
              },
              (error) => console.log('❌ Error GPS:', error),
              { 
                enableHighAccuracy: true, 
                distanceFilter: 2,
                interval: 3000, 
                fastestInterval: 2000 
              }
          );

          while (BackgroundJob.isRunning()) {
              await sleep(taskDataArguments.delay);
          }
          resolve();
      });
  };

  const startProcess = async () => {
    try {
        setIsSending(true); 
        await BackgroundJob.start(locationTask, backgroundOptions);
    } catch (e) {
        setIsSending(false);
        Alert.alert("Error", "No se pudo activar el servicio de fondo.");
    }
  }

  const stopProcess = async () => {
    if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
    setIsSending(false); 
    await BackgroundJob.stop();
    await stopBurritoService();
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) Geolocation.clearWatch(watchIdRef.current);
      BackgroundJob.stop(); 
    }
  }, []);
  
  return (
    <View style={styles.container}> 
        <MyCustomHeader title=' DRIVER APP ' />
        <View style={styles.body}> 
            <Pressable
              disabled={isSending}
              onPress={startProcess}
              style={[styles.button, { backgroundColor: isSending ? '#757575' : '#2060cd' }]}
            >
              <Text style={styles.btnText}> { isSending ? 'TRANSMITIENDO...' : 'INICIAR RUTA'} </Text>
            </Pressable>

            <Pressable
              disabled={!isSending}
              onPress={stopProcess}
              style={[styles.button, { backgroundColor: isSending ? '#d32f2f' : '#757575' }]}
            >
              <Text style={styles.btnText}> DETENER RUTA </Text>
            </Pressable>
            
            <Text style={{ marginTop: 20 }}> 
                { isSending ? '🟢 Servicio activo (Segundo plano)' : '🔴 Servicio detenido' } 
            </Text>
        </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  button: { padding: 18, borderRadius: 30, marginBottom: 15, width: '100%', alignItems: 'center', elevation: 4 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});