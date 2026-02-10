import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { USER_PROFILE_MOCK } from '../data/personMock';
import { sendUserData } from '../actions/bringInformationPost';

export const SendCoordinates = () => {


  const [isSending, setIsSending] = useState<boolean>(false); 
  const saveIntervalIdRef = useRef<any>(null);
  const indexUserRef = useRef<number>(0);


  const startProcess = () => {

    setIsSending(true); 

    saveIntervalIdRef.current = setInterval( async () => {

        const user = USER_PROFILE_MOCK[indexUserRef.current];


      const success = await sendUserData(user)

      if ( success ) {
        console.log('Enviado con exito')
      }

      indexUserRef.current = ( indexUserRef.current + 1 ) % USER_PROFILE_MOCK.length;

    }, 4000 )
  }


  const stopProcess = () => {

    if (saveIntervalIdRef.current) {
        clearInterval(saveIntervalIdRef.current);
        saveIntervalIdRef.current = null;
    }
    setIsSending(false);
  }

  useEffect(() => {
    return () => {
      stopProcess();
    }
  }, []) 
  
  
  return (
    <View style={styles.container}> 
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
          <Text style={{color: 'white'}} > { isSending ? 'ENVIANDO...' : 'ENVIAR'} </Text>
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
  )
}


const styles = StyleSheet.create({

  container: {
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