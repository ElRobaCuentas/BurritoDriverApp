import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Switch, Alert, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AdminService, Chofer } from '../services/admin_service';
import { FloatingBackButton } from '../../../shared/components/FloatingBackButton';
import { COLORS } from '../../../shared/theme/colors';
import { TYPOGRAPHY } from '../../../shared/theme/typography';

export const ChoferesScreen = () => {
  const navigation = useNavigation();
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Estados del Formulario
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');

  // Estado para edición
  const [editingDni, setEditingDni] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [saving, setSaving] = useState(false);

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

  // 3. Manejar Edición
  const handleEdit = async () => {
    if (!editingDni || !editNombre || !editApellidos) return;
    setSaving(true);
    try {
      await AdminService.updateChofer(editingDni, { nombre: editNombre, apellidos: editApellidos });
      setEditingDni(null);
      Alert.alert('Éxito', 'Conductor actualizado correctamente.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  // 4. Manejar Eliminación
  const handleDelete = async (chofer: Chofer) => {
    const tieneAsignacion = await AdminService.hasActiveAssignment(chofer.dni);
    if (tieneAsignacion) {
      Alert.alert('No permitido', 'Este conductor tiene una asignación activa. Cancele la asignación primero.');
      return;
    }
    Alert.alert(
      'Eliminar',
      `¿Eliminar a ${chofer.nombre} ${chofer.apellidos}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await AdminService.deleteChofer(chofer.dni);
              Alert.alert('Éxito', `Conductor ${chofer.nombre} eliminado.`);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ],
    );
  };

  // 5. Renderizar cada fila de la lista
  const renderItem = ({ item }: { item: Chofer }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.nombre} {item.apellidos}</Text>
        <Text style={styles.cardSubtitle}>DNI: {item.dni}</Text>
      </View>
      <View style={styles.cardActions}>
        <Switch
          value={item.activo}
          onValueChange={() => {
            const accion = item.activo ? 'desactivar' : 'activar';
            Alert.alert(
              'Confirmar',
              `¿Estás seguro que querés ${accion} a ${item.nombre} ${item.apellidos}?`,
              [
                { text: 'No', style: 'cancel' },
                { text: 'Sí', onPress: () => AdminService.toggleChoferStatus(item.dni, item.activo) },
              ],
            );
          }}
          trackColor={{ false: '#CCCCCC', true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            setEditingDni(item.dni);
            setEditNombre(item.nombre);
            setEditApellidos(item.apellidos);
          }}
        >
          <Text style={styles.iconText}>✏️</Text>
        </TouchableOpacity>
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
      <Text style={styles.screenTitle}>Gestión de Choferes</Text>
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

      {/* MODAL DE EDICIÓN */}
      <Modal visible={editingDni !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Conductor</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombres"
              placeholderTextColor="#999999"
              value={editNombre}
              onChangeText={setEditNombre}
            />
            <TextInput
              style={styles.input}
              placeholder="Apellidos"
              placeholderTextColor="#999999"
              value={editApellidos}
              onChangeText={setEditApellidos}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={handleEdit}
                disabled={saving}
              >
                <Text style={styles.buttonText}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonCancel]}
                onPress={() => setEditingDni(null)}
              >
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  buttonCancel: {
    backgroundColor: '#999999',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 24,
    width: '85%',
  },
  modalTitle: {
    fontFamily: TYPOGRAPHY.primary.bold,
    fontSize: 18,
    color: COLORS.textTitle,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
