import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Switch, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { AdminService, Chofer } from '../services/admin_service';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

export const ChoferesScreen = () => {
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Estados del Formulario
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');

  // 1. Cargar choferes en tiempo real
  useEffect(() => {
    const unsubscribe = AdminService.subscribeToChoferes((data) => {
      setChoferes(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Manejar Creación
  const handleCreate = async () => {
    if (!dni || !nombre || !apellidos) {
      Alert.alert('Error', 'Todos los campos son obligatorios');
      return;
    }
    if (dni.length < 8) {
      Alert.alert('Error', 'El DNI debe tener 8 dígitos');
      return;
    }

    setCreating(true);
    try {
      await AdminService.createChofer({ dni, nombre, apellidos });
      Alert.alert('Éxito', 'Chofer registrado correctamente. Su clave es su DNI.');
      setDni('');
      setNombre('');
      setApellidos('');
    } catch (error: any) {
      Alert.alert('Error al crear', error.message);
    } finally {
      setCreating(false);
    }
  };

  // 3. Renderizar cada fila de la lista
  const renderItem = ({ item }: { item: Chofer }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.nombre} {item.apellidos}</Text>
        <Text style={styles.cardSubtitle}>DNI: {item.dni}</Text>
      </View>
      <Switch
        value={item.activo}
        onValueChange={() => {
          AdminService.toggleChoferStatus(item.dni, item.activo);
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
        <Text style={styles.sectionTitle}>Registrar Nuevo Chofer</Text>
        <TextInput
          style={styles.input}
          placeholder="DNI (8 dígitos)"
          placeholderTextColor="#999999"
          keyboardType="numeric"
          maxLength={8}
          value={dni}
          onChangeText={setDni}
        />
        <TextInput
          style={styles.input}
          placeholder="Nombres"
          placeholderTextColor="#999999"
          value={nombre}
          onChangeText={setNombre}
        />
        <TextInput
          style={styles.input}
          placeholder="Apellidos"
          placeholderTextColor="#999999"
          value={apellidos}
          onChangeText={setApellidos}
        />
        <TouchableOpacity
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          <Text style={styles.buttonText}>
            {creating ? 'Registrando...' : 'Registrar Chofer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN LISTA */}
      <Text style={[styles.sectionTitle, { marginHorizontal: 20 }]}>Conductores Registrados</Text>
      <FlatList
        data={choferes}
        keyExtractor={(item) => item.dni}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No hay conductores registrados aún.</Text>
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
