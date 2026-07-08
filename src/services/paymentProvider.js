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
      // Stripe: publishable key. Square: application_id (SDK identifier).
      publishableKey: data.publishable_key || null,
      locationId: data.location_id || null,
      // Square only: the merchant access token the Mobile Payments SDK
      // authorizes with on-device. Stripe leaves this null (uses connection tokens).
      accessToken: data.access_token || null,
    };
    return cachedProvider;
  } catch (e) {
    return { provider: 'stripe', supportsTapToPay: true, publishableKey: null, locationId: null, accessToken: null };
  }
}

export function clearProviderCache() {
  cachedProvider = null;
}
