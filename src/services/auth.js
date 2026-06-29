import * as SecureStore from 'expo-secure-store';
import api from '../config/api';

export async function login(email, password) {
  const { data } = await api.post('/login', { email, password });
  if (data.token) {
    await SecureStore.setItemAsync('auth_token', data.token);
    await SecureStore.setItemAsync('user_name', data.user?.name || '');
    await SecureStore.setItemAsync('user_email', email);
  }
  return data;
}

export async function logout() {
  try {
    await api.post('/logout');
  } catch (e) {}
  await SecureStore.deleteItemAsync('auth_token');
  await SecureStore.deleteItemAsync('user_name');
  await SecureStore.deleteItemAsync('user_email');
}

export async function getToken() {
  return await SecureStore.getItemAsync('auth_token');
}

export async function getUserName() {
  return await SecureStore.getItemAsync('user_name');
}

export async function isAuthenticated() {
  const token = await SecureStore.getItemAsync('auth_token');
  return !!token;
}
