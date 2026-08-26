import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { NavigationContainer } from '@react-navigation/native';

import { SendCoordinates } from './screen/SendCoordinates';
import { LoginDriverScreen } from './screen/LoginDriverScreen';
import { AdminNavigator } from './navigation/AdminNavigator';
import { existeAdministrador } from './features/admin/services/admin_check';
import { COLORS } from './shared/theme/colors';
import { TYPOGRAPHY } from './shared/theme/typography';
import crashlytics from '@react-native-firebase/crashlytics';

export const DriverApp = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [roleError, setRoleError] = useState(false);
  const [roleAttempt, setRoleAttempt] = useState(0);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        crashlytics().setUserId(currentUser.uid);
      }
    });
    return subscriber;
  }, []);

  useEffect(() => {
    if (user) {
      setIsCheckingRole(true);
      setRoleError(false);
      existeAdministrador(user.uid)
        .then((admin) => {
          setIsAdmin(admin);
          setInitializing(false);
        })
        .catch(() => {
          setInitializing(false);
          setRoleError(true);
        })
        .finally(() => {
          setIsCheckingRole(false);
        });
    } else {
      setIsAdmin(false);
      setRoleError(false);
      setInitializing(false);
    }
  }, [user, roleAttempt]);

  const handleRetry = () => {
    setRoleAttempt(attempt => attempt + 1);
  };

  const handleLogout = async () => {
    try {
      await auth().signOut();
    } catch {
      crashlytics().recordError(new Error('Logout failed'), 'handleLogout');
      Alert.alert('Error', 'No se pudo cerrar la sesión. Inténtalo nuevamente.');
    }
  };

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <LoginDriverScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (isCheckingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (roleError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.errorContainer}>
          <Text style={styles.errorTitle}>No se pudo verificar tu cuenta</Text>
          <Text style={styles.errorMessage}>
            Verifica tu conexión a internet e inténtalo nuevamente.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
          </TouchableOpacity>
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
      <SafeAreaView style={styles.safeArea}>
        <SendCoordinates driverDni={user.email?.split('@')[0] || ''} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F9',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.background,
  },
  errorTitle: {
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 22,
    color: COLORS.textTitle,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorMessage: {
    fontFamily: TYPOGRAPHY.primary.regular,
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  retryButton: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  retryButtonText: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 16,
  },
  logoutButton: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutButtonText: {
    color: COLORS.primary,
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 15,
  },
});
