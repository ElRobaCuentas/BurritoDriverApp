import database from '@react-native-firebase/database';

interface LocationData {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  timestamp: number;
}

// NUEVA FUNCIÓN PARA T11: Actualiza usando el busId dinámico
export const updateBusLocation = async (busId: string, data: LocationData) => {
  try {
    await database().ref(`/ubicacion_buses/${busId}`).update({
      ...data,
      isActive: true,
    });
    return true; 
  } catch (error) {
    console.error('Error actualizando ubicación del bus:', error);
    return false;
  }
};

// NUEVA FUNCIÓN PARA T11: Detiene el servicio usando el busId dinámico
export const stopBusService = async (busId: string) => {
  try {
    await database().ref(`/ubicacion_buses/${busId}`).update({
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Error deteniendo servicio del bus:', error);
    return false;
  }
};