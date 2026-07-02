import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AdminService, Chofer, Bus, Asignacion } from '../services/admin_service';
import { FloatingBackButton } from '../../../shared/components/FloatingBackButton';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

export const AsignacionesScreen = () => {
  const navigation = useNavigation();
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedChofer, setSelectedChofer] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);

  useEffect(() => {
    // 1. Cargar datos en paralelo
    const unsubChoferes = AdminService.subscribeToChoferes((data) => {
      setChoferes(data.filter(c => c.activo)); // Solo aptos
    });
    const unsubBuses = AdminService.subscribeToBuses((data) => {
      setBuses(data.filter(b => b.activo)); // Solo aptos
    });
    const unsubAsignaciones = AdminService.subscribeToAsignacionesHoy((data) => {
      setAsignaciones(data);
      setLoading(false);
    });

    return () => {
      unsubChoferes();
      unsubBuses();
      unsubAsignaciones();
    };
  }, []);

  const handleCreate = async () => {
    if (!selectedChofer || !selectedBus) {
      Alert.alert('Error', 'Seleccione un conductor y un bus.');
      return;
    }
    
    setCreating(true);
    try {
      await AdminService.createAsignacion(selectedChofer, selectedBus);
      Alert.alert('Éxito', 'Asignación creada para el turno de hoy.');
      setSelectedChofer(null);
      setSelectedBus(null);
    } catch (error: any) {
      Alert.alert('Asignación bloqueada', error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = (id: string) => {
    Alert.alert('Cancelar Asignación', '¿El conductor dejará de manejar este bus hoy?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', onPress: () => AdminService.cancelarAsignacion(id) }
    ]);
  };

  const renderAsignacion = ({ item }: { item: Asignacion }) => {
    const choferNombre = choferes.find(c => c.dni === item.choferId)?.nombre || item.choferId;
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{choferNombre}</Text>
          <Text style={styles.cardSubtitle}>Bus Asignado: {item.busId}</Text>
        </View>
        <TouchableOpacity 
          style={styles.cancelBtn} 
          onPress={() => handleCancel(item.id)}
        >
          <Text style={styles.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
      <Text style={styles.screenTitle}>Asignaciones Diarias</Text>
      {/* SECCIÓN CREAR */}
      <View style={styles.formContainer}>
        <Text style={styles.sectionTitle}>Turno de Hoy: {AdminService.getTodayDateString()}</Text>
        
        <Text style={styles.label}>1. Seleccione Conductor</Text>
        <View style={styles.selectorGrid}>
          {choferes.map(c => (
            <TouchableOpacity 
              key={c.dni}
              style={[styles.chip, selectedChofer === c.dni && styles.chipSelected]}
              onPress={() => setSelectedChofer(c.dni)}
            >
              <Text style={[styles.chipText, selectedChofer === c.dni && styles.chipTextSelected]}>
                {c.nombre} {c.apellidos}
              </Text>
            </TouchableOpacity>
          ))}
          {choferes.length === 0 && <Text style={styles.emptyText}>No hay conductores activos.</Text>}
        </View>

        <Text style={styles.label}>2. Seleccione Vehículo</Text>
        <View style={styles.selectorGrid}>
          {buses.map(b => (
            <TouchableOpacity 
              key={b.placa}
              style={[styles.chip, selectedBus === b.placa && styles.chipSelected]}
              onPress={() => setSelectedBus(b.placa)}
            >
              <Text style={[styles.chipText, selectedBus === b.placa && styles.chipTextSelected]}>
                {b.placa}
              </Text>
            </TouchableOpacity>
          ))}
          {buses.length === 0 && <Text style={styles.emptyText}>No hay buses activos.</Text>}
        </View>

        <TouchableOpacity
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          <Text style={styles.buttonText}>
            {creating ? 'Asignando...' : 'Crear Asignación'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN LISTA ACTIVA */}
      <Text style={[styles.sectionTitle, { marginHorizontal: 20 }]}>Asignaciones Activas</Text>
      <FlatList
        data={asignaciones}
        keyExtractor={(item) => item.id}
        renderItem={renderAsignacion}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nadie está manejando en este momento.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  screenTitle: {
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 22,
    color: COLORS.textTitle,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  formContainer: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.secondary, marginBottom: 10 },
  sectionTitle: { fontFamily: TYPOGRAPHY.primary.semiBold, fontSize: 18, color: COLORS.textTitle, marginBottom: 15 },
  label: { fontFamily: TYPOGRAPHY.primary.bold, fontSize: 14, color: COLORS.primary, marginBottom: 8, marginTop: 10 },
  selectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  chip: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: COLORS.secondary, borderRadius: 20, borderWidth: 1, borderColor: '#DDD' },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontFamily: TYPOGRAPHY.primary.medium, color: '#555', fontSize: 13 },
  chipTextSelected: { color: COLORS.white },
  button: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: COLORS.white, fontFamily: TYPOGRAPHY.primary.bold, fontSize: 16 },
  list: { padding: 20 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white, padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: COLORS.secondary },
  cardInfo: { flex: 1 },
  cardTitle: { fontFamily: TYPOGRAPHY.primary.semiBold, fontSize: 16, color: COLORS.textTitle },
  cardSubtitle: { fontFamily: TYPOGRAPHY.primary.regular, fontSize: 14, color: '#666666', marginTop: 2 },
  cancelBtn: { backgroundColor: '#FF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  cancelBtnText: { color: COLORS.white, fontFamily: TYPOGRAPHY.primary.bold, fontSize: 12 },
  emptyText: { color: '#888', fontFamily: TYPOGRAPHY.primary.regular, fontSize: 13, fontStyle: 'italic' }
});
