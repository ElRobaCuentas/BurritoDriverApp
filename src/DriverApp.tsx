import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { ActivityIndicator, View } from 'react-native';

import { SendCoordinates } from './screen/SendCoordinates';
import { LoginDriverScreen } from './screen/LoginDriverScreen'; 

export const DriverApp = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);

  // Escucha cambios en la sesión sin recargar la app
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (initializing) setInitializing(false);
    });
    return subscriber; // Limpieza automática
  }, [initializing]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00AEEF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F7F9' }}>
        {user ? (
          <SendCoordinates driverDni={user.email?.split('@')[0] || ''} />
        ) : (
          <LoginDriverScreen />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};