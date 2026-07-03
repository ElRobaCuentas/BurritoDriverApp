import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { COLORS } from '../shared/theme/colors';
import { TYPOGRAPHY } from '../shared/theme/typography';

export const LoginDriverScreen = () => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (dni.trim().length < 8) {
      Alert.alert('Error', 'Ingresa un DNI válido (mínimo 8 dígitos).');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const email = `${dni.trim()}@burritodriver.com`;
      await auth().signInWithEmailAndPassword(email, password);
    } catch (error: any) {
      if (error.code === 'auth/network-request-failed') {
        Alert.alert('Sin conexión', 'Verifica tu conexión a internet.');
      } else if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password'
      ) {
        Alert.alert('Datos incorrectos', 'DNI o contraseña no válidos.');
      } else if (error.code === 'auth/user-disabled') {
        Alert.alert('Cuenta deshabilitada', 'Comunícate con la oficina.');
      } else {
        Alert.alert('Error al ingresar', 'Ocurrió un error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          Acceso para conductores y administradores
        </Text>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>DNI</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 12345678"
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={12}
              value={dni}
              onChangeText={setDni}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu contraseña"
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  title: {
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 36,
    color: COLORS.textTitle,
    textAlign: 'center',
    marginBottom: 40,
  },
  formSection: {},
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontFamily: TYPOGRAPHY.primary.medium,
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.textTitle,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    fontFamily: TYPOGRAPHY.primary.regular,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    elevation: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 16,
  },
});
