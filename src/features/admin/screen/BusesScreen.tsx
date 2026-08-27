import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Switch, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AdminService, Bus } from '../services/admin_service';
import { FloatingBackButton } from '../../../shared/components/FloatingBackButton';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

export const BusesScreen = () => {
  const navigation = useNavigation();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Estado del Formulario
  const [placa, setPlaca] = useState('');

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
    if (!placa) {
      Alert.alert('Error', 'La placa es obligatoria');
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
      });
      Alert.alert('Éxito', 'Bus registrado correctamente en la flota.');
      setPlaca('');
    } catch (error: any) {
      Alert.alert('Error al registrar', error.message);
    } finally {
      setCreating(false);
    }
  };

  // 3. Manejar Eliminación
  const handleDelete = async (bus: Bus) => {
    const tieneAsignacion = await AdminService.hasActiveBusAssignment(bus.placa);
    if (tieneAsignacion) {
      Alert.alert('No permitido', 'Este bus tiene una asignación activa. Cancele la asignación primero.');
      return;
    }
    Alert.alert(
      'Eliminar',
      `¿Eliminar el bus ${bus.placa}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await AdminService.deleteBus(bus.placa);
              Alert.alert('Éxito', `Bus ${bus.placa} eliminado.`);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ],
    );
  };

  // 4. Renderizar cada fila de la lista
  const renderItem = ({ item }: { item: Bus }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.placa}</Text>
      </View>
      <View style={styles.cardActions}>
        <Switch
          value={item.activo}
          onValueChange={(newValue: boolean) => {
            const accion = item.activo ? 'desactivar' : 'activar';
            Alert.alert(
              'Confirmar',
              `¿Estás seguro que querés ${accion} el bus ${item.placa}?`,
              [
                { text: 'No', style: 'cancel' },
                { text: 'Sí', onPress: () => AdminService.toggleBusStatus(item.placa, newValue) },
              ],
            );
          }}
          trackColor={{ false: '#CCCCCC', true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.iconText}>🗑️</Text>
        </TouchableOpacity>
      </View>
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
      <FloatingBackButton onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>Gestión de Buses</Text>
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
  screenTitle: {
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 22,
    color: COLORS.textTitle,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  iconText: {
    fontSize: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666666',
    fontFamily: TYPOGRAPHY.primary.regular,
    marginTop: 20,
  },
});
