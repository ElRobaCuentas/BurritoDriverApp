import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MyCustomHeader } from '../components/header/MyCustomHeader';

import { updateBurritoLocation, stopBurritoService } from '../services/firebaseService';
import Geolocation from '@react-native-community/geolocation';

export const SendCoordinates = () => {


  const [isSending, setIsSending] = useState<boolean>(false); 
  const intervalIdRef = useRef<number | null>(null);

  const startProcess = () => {
    setIsSending(true); 

    const runUpdate = () => {
        Geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;
                
                const success = await updateBurritoLocation({
                    latitude,
                    longitude,
                    heading: heading || 0, 
                    speed: speed || 0      
                });

                if (success) console.log('Coordenada subida:', latitude, longitude);
            },
            error => console.log('Error GPS:', error),
            // Configuración GPS: Alta precisión, timeout de 20s, caché máx 1s.
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
        );
    };

    runUpdate();

    intervalIdRef.current = setInterval(runUpdate, 3000); 
  }

  const stopProcess = async () => {
    if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
    }
    
    setIsSending(false); 

    await stopBurritoService();
    Alert.alert("Servicio Detenido", "Se desconectó de la nube.");
  }

  useEffect(() => {
    return () => {
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    }
  }, [])
  
  
  return (
    <View style={styles.container}> 

        <MyCustomHeader 
          title=' DRIVER '
        />

        <View style={styles.body}> 
        <Pressable
          disabled = {isSending}
          onPress={startProcess}
          style={({pressed}) => [
            styles.button,
            {
              backgroundColor: isSending ? '#757575' : '#2060cd',
            }
          ]}
        >
          <Text style={{color: 'white'}} > { isSending ? 'TRANSMITIENDO DATOS' : 'ENVIAR COORDENADAS'} </Text>
        </Pressable>

        <Pressable
          disabled = {!isSending}
          onPress={stopProcess}
          style={({pressed}) => [
            styles.button,
            {
              backgroundColor: isSending ? '#2060cd' : '#757575',
            }
          ]}
        >
          <Text style={{color: 'white'}} > DETENER </Text>
        </Pressable>
        <Text> { isSending ? 'Enviando datos' : 'Envie sus datos' } </Text>
          
        </View>
    </View>
  )
}


const styles = StyleSheet.create({

  container: {
    flex: 1,
  },

  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    padding: 15,
    borderRadius: 30,
    marginBottom: 10,
  }

})