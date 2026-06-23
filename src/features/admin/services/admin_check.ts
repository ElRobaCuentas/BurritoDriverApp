import { firebaseDatabase } from '../../../shared/config/firebase';

export const existeAdministrador = async (uid: string): Promise<boolean> => {
  try {
    const snapshot = await firebaseDatabase.ref(`/administradores/${uid}`).once('value');
    return snapshot.exists();
  } catch (error) {
    console.error('[AdminCheck] Error verificando administrador:', error);
    return false;
  }
};
