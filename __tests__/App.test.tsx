/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-firebase/auth', () => {
  return () => ({
    onAuthStateChanged: jest.fn((cb: (user: null) => void) => {
      cb(null);
      return jest.fn();
    }),
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    currentUser: null,
  });
});

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    ref: jest.fn(() => ({
      orderByChild: jest.fn(() => ({
        equalTo: jest.fn(() => ({
          once: jest.fn(() => Promise.resolve({ val: () => null })),
        })),
      })),
    })),
  })),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/screen/SendCoordinates', () => ({
  SendCoordinates: () => null,
}));

jest.mock('../src/screen/LoginDriverScreen', () => ({
  LoginDriverScreen: () => null,
}));

import { DriverApp } from '../src/DriverApp';

test('debería renderizar el auth gate sin crash', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<DriverApp />);
  });
});
