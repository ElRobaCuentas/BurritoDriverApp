import { firebaseDatabase } from '../../../shared/config/firebase';

export const existeAdministrador = async (uid: string): Promise<boolean> => {
  const snapshot = await firebaseDatabase.ref(`/administradores/${uid}`).once('value');
  return snapshot.exists();
};
