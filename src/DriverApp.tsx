import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SendCoordinates } from './screen/SendCoordinates';
import auth from '@react-native-firebase/auth';
import { ActivityIndicator, View } from 'react-native';

export const DriverApp = () => {
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    auth()
      .signInWithEmailAndPassword(
        'choferburrito@unmsm.com',
        'choferappaccount'
      )
      .then(() => setAutenticado(true))
      .catch(err => console.warn('Error auth conductor:', err));
  }, []);

  if (!autenticado) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2060cd" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, borderWidth: 2, borderColor: 'blue' }}>
        <SendCoordinates />
      </SafeAreaView>
    </SafeAreaProvider>
  );
};