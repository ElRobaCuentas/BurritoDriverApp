import database from '@react-native-firebase/database';

interface LocationData {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
}

export const updateBurritoLocation = async (data: LocationData) => {
  try {
    await database().ref('/ubicacion_burrito').set({
      ...data,
      timestamp: Date.now(),
      isActive: true,
    });
    
    return true; 
  } catch (error) {
    console.error('Error en FirebaseService:', error);
    return false;
  }
};

export const stopBurritoService = async () => {
  try {
    await database().ref('/ubicacion_burrito').update({
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Error deteniendo servicio:', error);
    return false;
  }
};