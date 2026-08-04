import { firebaseDatabase } from '../../../shared/config/firebase';
import { withTimeout } from '../../../shared/utils/timeout';

// C4.AUTH: el auth gate corre una sola vez al abrir la app. Sin red,
// `once('value')` de rnfirebase nunca resuelve ni rechaza (hang indefinido).
// Acotamos el read para que el `.catch` de DriverApp dispare la pantalla de
// error existente (REINTENTAR / CERRAR SESIÓN) en lugar de un spinner eterno.
const ROLE_TIMEOUT_MS = 10000;

export const existeAdministrador = async (uid: string): Promise<boolean> => {
  const snapshot = await withTimeout(
    firebaseDatabase.ref(`/administradores/${uid}`).once('value'),
    ROLE_TIMEOUT_MS,
  );
  return snapshot.exists();
};
