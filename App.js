import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isAuthenticated } from './src/services/auth';
import LoginScreen from './src/screens/LoginScreen';
import SetupScreen from './src/screens/SetupScreen';
import TerminalScreen from './src/screens/TerminalScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    (async () => {
      const authed = await isAuthenticated();
      setInitialRoute(authed ? 'Setup' : 'Login');
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="Terminal" component={TerminalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
