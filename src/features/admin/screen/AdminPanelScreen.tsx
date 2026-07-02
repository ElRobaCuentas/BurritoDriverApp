import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

type AdminPanelNavProp = NativeStackNavigationProp<AdminStackParamList, 'AdminPanelScreen'>;

export const AdminPanelScreen = () => {
  const navigation = useNavigation<AdminPanelNavProp>();

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: () => auth().signOut() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel de Control</Text>
      <Text style={styles.subtitle}>Selecciona el módulo que deseas gestionar:</Text>

      <View style={styles.menuContainer}>
        {/* BOTÓN GESTIÓN DE CHOFERES */}
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => navigation.navigate('ChoferesScreen')}
        >
          <Text style={styles.buttonEmoji}>🚌</Text>
          <View style={styles.buttonTextContainer}>
            <Text style={styles.buttonTitle}>Gestión de Choferes</Text>
            <Text style={styles.buttonDescription}>Registrar, activar y desactivar conductores</Text>
          </View>
        </TouchableOpacity>

        {/* BOTÓN GESTIÓN DE BUSES */}
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => navigation.navigate('BusesScreen')}
        >
          <Text style={styles.buttonEmoji}>🚐</Text>
          <View style={styles.buttonTextContainer}>
            <Text style={styles.buttonTitle}>Gestión de Flota (Buses)</Text>
            <Text style={styles.buttonDescription}>Registrar placas, modelos y estado de los vehículos</Text>
          </View>
        </TouchableOpacity>

        {/* BOTÓN ASIGNACIONES */}
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => navigation.navigate('AsignacionesScreen')}
        >
          <Text style={styles.buttonEmoji}>📋</Text>
          <View style={styles.buttonTextContainer}>
            <Text style={styles.buttonTitle}>Asignaciones Diarias</Text>
            <Text style={styles.buttonDescription}>Vincular conductores con vehículos para el turno de hoy</Text>
          </View>
        </TouchableOpacity>

        {/* BOTÓN CERRAR SESIÓN */}
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },
  title: {
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 24,
    color: COLORS.textTitle,
    marginTop: 10,
  },
  subtitle: {
    fontFamily: TYPOGRAPHY.primary.regular,
    fontSize: 14,
    color: '#666666',
    marginBottom: 30,
    marginTop: 5,
  },
  menuContainer: {
    gap: 15,
  },
  menuButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.secondary,
    elevation: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonEmoji: {
    fontSize: 30,
    marginRight: 15,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 16,
    color: COLORS.textTitle,
  },
  buttonDescription: {
    fontFamily: TYPOGRAPHY.primary.regular,
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#FF4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  logoutText: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 16,
  },
});
