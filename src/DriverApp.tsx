import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';

import { SendCoordinates } from './screen/SendCoordinates';
import { LoginDriverScreen } from './screen/LoginDriverScreen';
import { AdminNavigator } from './navigation/AdminNavigator';
import { existeAdministrador } from './features/admin/services/admin_check';

export const DriverApp = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return subscriber;
  }, []);

  useEffect(() => {
    if (user) {
      existeAdministrador(user.uid).then((admin) => {
        setIsAdmin(admin);
        setInitializing(false);
      });
    } else {
      setIsAdmin(false);
      setInitializing(false);
    }
  }, [user]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00AEEF" />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F7F9' }}>
          <LoginDriverScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (isAdmin) {
    return (
      <NavigationContainer>
        <AdminNavigator />
      </NavigationContainer>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F7F9' }}>
        <SendCoordinates driverDni={user.email?.split('@')[0] || ''} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
};
