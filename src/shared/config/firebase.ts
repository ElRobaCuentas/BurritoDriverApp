import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';

const db = database();
const authInstance = auth();

export const firebaseDatabase = db;
export const firebaseAuth = authInstance;
