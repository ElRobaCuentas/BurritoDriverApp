import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminPanelScreen } from '../features/admin/screen/AdminPanelScreen';
import { ChoferesScreen } from '../features/admin/screen/ChoferesScreen';
import { BusesScreen } from '../features/admin/screen/BusesScreen';
import { AsignacionesScreen } from '../features/admin/screen/AsignacionesScreen';
import { COLORS } from '../shared/theme/colors';

export type AdminStackParamList = {
  AdminPanelScreen: undefined;
  ChoferesScreen: undefined;
  BusesScreen: undefined;
  AsignacionesScreen: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: COLORS.background },
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
