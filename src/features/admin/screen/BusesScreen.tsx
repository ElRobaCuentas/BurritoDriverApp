import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Switch, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { AdminService, Bus } from '../services/admin_service';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

export const BusesScreen = () => {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Estados del Formulario
  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');

  // 1. Cargar buses en tiempo real
  useEffect(() => {
    const unsubscribe = AdminService.subscribeToBuses((data) => {
      setBuses(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Manejar Creación
  const handleCreate = async () => {
    if (!placa || !modelo || !marca || !anio) {
      Alert.alert('Error', 'Todos los campos son obligatorios');
      return;
    }
    
    if (placa.trim().length < 6) {
      Alert.alert('Error', 'Ingrese una placa válida');
      return;
    }

    setCreating(true);
    try {
      await AdminService.createBus({ 
        placa: placa.toUpperCase().trim(), 
        modelo: modelo.trim(), 
        marca: marca.trim(), 
        anio: anio.trim() 
      });
      Alert.alert('Éxito', 'Bus registrado correctamente en la flota.');
      setPlaca('');
      setMarca('');
      setModelo('');
      setAnio('');
    } catch (error: any) {
      Alert.alert('Error al registrar', error.message);
    } finally {
      setCreating(false);
    }
  };

  // 3. Renderizar cada fila de la lista
  const renderItem = ({ item }: { item: Bus }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.placa}</Text>
        <Text style={styles.cardSubtitle}>{item.marca} {item.modelo} - {item.anio}</Text>
      </View>
      <Switch
        value={item.activo}
        onValueChange={(newValue: boolean) => {
          AdminService.toggleBusStatus(item.placa, newValue).catch(() => {});
        }}
        trackColor={{ false: '#CCCCCC', true: COLORS.primary }}
        thumbColor={COLORS.white}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* SECCIÓN FORMULARIO */}
      <View style={styles.formContainer}>
        <Text style={styles.sectionTitle}>Registrar Nuevo Bus</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Placa (Ej: AHK-452)"
          placeholderTextColor="#999999"
          autoCapitalize="characters"
          value={placa}
          onChangeText={setPlaca}
        />
        <TextInput
          style={styles.input}
          placeholder="Marca (Ej: Mercedes-Benz)"
          placeholderTextColor="#999999"
          value={marca}
          onChangeText={setMarca}
        />
        <TextInput
          style={styles.input}
          placeholder="Modelo (Ej: Sprinter)"
          placeholderTextColor="#999999"
          value={modelo}
          onChangeText={setModelo}
        />
        <TextInput
          style={styles.input}
          placeholder="Año (Ej: 2022)"
          placeholderTextColor="#999999"
          keyboardType="numeric"
          maxLength={4}
          value={anio}
          onChangeText={setAnio}
        />

        <TouchableOpacity
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          <Text style={styles.buttonText}>
            {creating ? 'Registrando...' : 'Registrar Bus'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN LISTA */}
      <Text style={[styles.sectionTitle, { marginHorizontal: 20 }]}>Flota Registrada</Text>
      <FlatList
        data={buses}
        keyExtractor={(item) => item.placa}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No hay buses registrados aún.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  formContainer: {
    padding: 20,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 20,
    color: COLORS.textTitle,
    marginBottom: 15,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    color: COLORS.textTitle,
    fontFamily: TYPOGRAPHY.primary.regular,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 16,
  },
  list: {
    padding: 20,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: TYPOGRAPHY.primary.semiBold,
    fontSize: 16,
    color: COLORS.textTitle,
  },
  cardSubtitle: {
    fontFamily: TYPOGRAPHY.primary.regular,
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666666',
    fontFamily: TYPOGRAPHY.primary.regular,
    marginTop: 20,
  },
});
