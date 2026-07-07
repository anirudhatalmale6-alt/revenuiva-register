import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Devices are provisioned via the master (app.revenuivaai.com/pos/activate),
// but all practice POS operations (login, orders, payments) run on the client
// platform. This is the operational base used for everything after pairing.
const OPERATIONAL_BASE = 'https://client.revenuivaai.com/api';

const api = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

api.interceptors.request.use(async (config) => {
  // Resolve the per-practice API base from activation, but never send POS
  // operations to the provisioning host — practices live on the client platform.
  let apiBase = await SecureStore.getItemAsync('api_base');
  if (!apiBase || apiBase.includes('app.revenuivaai.com')) {
    apiBase = OPERATIONAL_BASE;
  }
  config.baseURL = `${apiBase.replace(/\/$/, '')}/pos`;

  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const deviceToken = await SecureStore.getItemAsync('device_token');
  if (deviceToken) config.headers['X-Device-Token'] = deviceToken;

  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(error);
  }
);

export default api;
