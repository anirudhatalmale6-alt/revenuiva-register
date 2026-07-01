import { getConnectionToken } from './pos';
import * as SecureStore from 'expo-secure-store';

let cachedProvider = null;

export async function getProviderInfo() {
  if (cachedProvider) return cachedProvider;
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    const { default: api } = await import('../config/api');
    const { data } = await api.get('/gateway-info', {
      headers: { Authorization: `Bearer ${token}` },
    });
    cachedProvider = {
      provider: data.provider || 'stripe',
      supportsTapToPay: data.supports_tap_to_pay ?? true,
      publishableKey: data.publishable_key || null,
    };
    return cachedProvider;
  } catch (e) {
    return { provider: 'stripe', supportsTapToPay: true, publishableKey: null };
  }
}

export function clearProviderCache() {
  cachedProvider = null;
}
