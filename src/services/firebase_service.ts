import database from '@react-native-firebase/database';

// Definición flexible: El timestamp es obligatorio para la aduana, 
// lo demás es opcional para permitir "latidos" sin movimiento.
interface LocationData {
  latitude?: number;
  longitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

const BURRITO_LOCATION_PATH = '/ubicacion_burrito';

export const updateBurritoLocation = async (data: LocationData) => {
  try {
    await database().ref(BURRITO_LOCATION_PATH).update({
      ...data,
      isActive: true, // Forzamos que siempre esté activo al actualizar
    });
    return true;
  } catch (error) {
    console.error('Error en FirebaseService:', error);
    return false;
  }
};

export const stopBurritoService = async () => {
  try {
    await database().ref(BURRITO_LOCATION_PATH).update({
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Error deteniendo servicio:', error);
    return false;
  }
};