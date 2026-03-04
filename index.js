/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { DriverApp } from './src/DriverApp';
import { name as appName } from './app.json';
import database from '@react-native-firebase/database';

database().setPersistenceEnabled(true);

AppRegistry.registerComponent(appName, () => DriverApp);