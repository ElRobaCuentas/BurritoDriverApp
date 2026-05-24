import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import auth from '@react-native-firebase/auth';

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
      // Construimos el email dinámicamente como pide el requerimiento
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
      <View style={styles.formContainer}>
        <Text style={styles.title}>Oficina de Transportes</Text>
        <Text style={styles.subtitle}>Portal del Conductor</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>DNI del Conductor</Text>
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
            placeholder="********"
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
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9', justifyContent: 'center' },
  formContainer: { paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40, marginTop: 5 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, color: '#333', marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 16, fontSize: 16, color: '#1A1A1A',
    borderWidth: 1, borderColor: '#E5E5E5'
  },
  button: {
    backgroundColor: '#00AEEF', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 10, elevation: 2
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});