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
        animation: 'none',
      }}
    >
      <Stack.Screen
        name="AdminPanelScreen"
        component={AdminPanelScreen}
      />
      <Stack.Screen
        name="ChoferesScreen"
        component={ChoferesScreen}
      />
      <Stack.Screen
        name="BusesScreen"
        component={BusesScreen}
      />
      <Stack.Screen
        name="AsignacionesScreen"
        component={AsignacionesScreen}
      />
    </Stack.Navigator>
  );
};
