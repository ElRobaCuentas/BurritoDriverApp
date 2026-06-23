import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AdminPanelScreen } from '../features/admin/screen/AdminPanelScreen';
import { ChoferesScreen } from '../features/admin/screen/ChoferesScreen';
import { BusesScreen } from '../features/admin/screen/BusesScreen';
import { AsignacionesScreen } from '../features/admin/screen/AsignacionesScreen';

export type AdminStackParamList = {
  AdminPanelScreen: undefined;
  ChoferesScreen: undefined;
  BusesScreen: undefined;
  AsignacionesScreen: undefined;
};

const Stack = createStackNavigator<AdminStackParamList>();

export const AdminNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: '#00AEEF',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="AdminPanelScreen"
        component={AdminPanelScreen}
        options={{ title: 'Panel de Control' }}
      />
      <Stack.Screen
        name="ChoferesScreen"
        component={ChoferesScreen}
        options={{ title: 'Gestión de Choferes' }}
      />
      <Stack.Screen
        name="BusesScreen"
        component={BusesScreen}
        options={{ title: 'Gestión de Flota' }}
      />
      <Stack.Screen
        name="AsignacionesScreen"
        component={AsignacionesScreen}
        options={{ title: 'Asignaciones Diarias' }}
      />
    </Stack.Navigator>
  );
};
