import { useCallback, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { PHASES } from './PaymentTerminal';

/**
 * Square adapter for the PaymentTerminal contract.
 *
 * IMPORTANT — LAZY NATIVE LOAD: the Square native SDK is required only when a
 * Square payment is actually initiated (init()/collect()), never at module load
 * or app startup. This keeps app launch and every Stripe-only practice fully
 * clear of Square's native code — a Stripe device never touches the Square SDK
 * at all, and startup can never be affected by it.
 */
let _sq = undefined; // undefined = not loaded yet, null = unavailable in build, object = SDK
function loadSquare() {
  if (_sq === undefined) {
    try {
      _sq = require('mobile-payments-sdk-react-native');
    } catch (e) {
      _sq = null; // Square SDK not compiled into this build.
    }
  }
  return _sq;
}

async function fetchSquareLocation() {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    const { default: api } = await import('../config/api');
    const { data } = await api.get('/gateway-info', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.location_id || '';
  } catch (e) {
    return '';
  }
}

export function useSquareTerminalAdapter() {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const setReadyBoth = (v) => {
    readyRef.current = v;
    setReady(v);
  };

  const init = useCallback(async (info) => {
    const sq = loadSquare();
    if (!sq) return;
    try {
      const authState = await sq.getAuthorizationState();
      if (authState === 'AUTHORIZED') {
        setReadyBoth(true);
        return;
      }
      // Square authorizes on-device with the merchant ACCESS TOKEN (not the
      // application_id — that's the SDK identifier set in native config).
      const token = info?.accessToken;
      const locationId = info?.locationId || (await fetchSquareLocation());
      if (token && locationId) {
        await sq.authorize(token, locationId);
        setReadyBoth(true);
      }
    } catch (e) {
      // stay not-ready; collect() will surface a clear message
    }
  }, []);

  const connect = useCallback(async () => {
    // Square authorizes during init(); there is no separate reader handshake.
    return { ok: readyRef.current };
  }, []);

  const collect = useCallback(async (order, { onPhase }) => {
    const sq = loadSquare();
    if (!sq) {
      return { ok: false, message: 'Square is not available in this build.' };
    }
    onPhase(PHASES.INITIALIZING, 'Starting Square payment...');
    try {
      // Sandbox: present the on-screen mock reader so a simulated card can
      // complete the sale (skipped in production).
      try {
        const env = sq.getEnvironment ? String(await sq.getEnvironment()) : '';
        if (/sandbox/i.test(env) && sq.showMockReaderUI) {
          await sq.showMockReaderUI();
        }
      } catch (_) { /* non-fatal */ }

      const amountCents = Math.round(Number(order.total_amount) * 100);
      const CurrencyCode = sq.CurrencyCode || {};
      const ProcessingMode = sq.ProcessingMode || {};
      const PromptMode = sq.PromptMode || {};
      const AddMethod = sq.AdditionalPaymentMethodType || {};

      onPhase(PHASES.TAPPING, 'Follow the prompt to take payment...');
      const payment = await sq.startPayment(
        {
          amountMoney: { amount: amountCents, currencyCode: CurrencyCode.USD ?? 'USD' },
          processingMode: ProcessingMode.ONLINE_ONLY ?? 0,
          idempotencyKey: `pos-${order.id}-${Date.now()}`,
          referenceId: `POS-${order.id}`,
          note: `Order #${order.id}`,
        },
        {
          additionalMethods: [AddMethod.ALL ?? 'ALL'],
          mode: PromptMode.DEFAULT ?? 0,
        }
      );

      onPhase(PHASES.PROCESSING, 'Finalizing...');
      return { ok: true, transactionId: payment?.id, paymentMethod: 'tap_to_pay' };
    } catch (e) {
      const detail = e?.message || e?.code || String(e);
      if (/cancel/i.test(detail) || e?.code === 'CANCELED') {
        return { ok: false, message: 'Payment was cancelled.' };
      }
      // Surface the real Square error so any remaining issue is diagnosable.
      return { ok: false, message: `Square: ${detail}` };
    }
  }, []);

  // available is optimistic; the real (lazy) load + guard happens in collect().
  return { provider: 'square', ready, available: true, init, connect, collect };
}

export default useSquareTerminalAdapter;
