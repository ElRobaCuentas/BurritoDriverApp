import database from '@react-native-firebase/database';

interface LocationData {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
}
const BURRITO_LOCATION_PATH = '/ubicacion_burrito';

export const updateBurritoLocation = async (data: LocationData) => {
  try {
    await database().ref(BURRITO_LOCATION_PATH).set({
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
    await database().ref(BURRITO_LOCATION_PATH).update({
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Error deteniendo servicio:', error);
    return false;
  }
};