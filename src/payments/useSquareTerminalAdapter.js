import { useCallback, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { PHASES } from './PaymentTerminal';

/**
 * Square adapter for the PaymentTerminal contract. Wraps Square's Mobile
 * Payments SDK (Tap to Pay on iPhone via Square).
 *
 * IMPORTANT — native gating: the Square native module is only present when the
 * build is compiled with it (see the Expo config-plugin flag). Requiring it
 * defensively means a Stripe-only build never drags Square's native code in,
 * which is exactly what avoids the two-SDK build collisions. `available` tells
 * the app whether this processor can actually run in the current binary.
 */
let sqAuthorize, sqStartPayment, sqGetAuthState;
try {
  const m = require('mobile-payments-sdk-react-native');
  sqAuthorize = m.authorize;
  sqStartPayment = m.startPayment;
  sqGetAuthState = m.getAuthorizationState;
} catch (e) {
  // Square SDK not compiled into this build — Stripe-only. `available` = false.
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
  const available = !!sqStartPayment;
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const setReadyBoth = (v) => {
    readyRef.current = v;
    setReady(v);
  };

  const init = useCallback(
    async (info) => {
      if (!available) return;
      try {
        const authState = await sqGetAuthState();
        if (authState === 'AUTHORIZED') {
          setReadyBoth(true);
          return;
        }
        const token = info?.publishableKey;
        const locationId = await fetchSquareLocation();
        if (token && locationId) {
          await sqAuthorize(token, locationId);
          setReadyBoth(true);
        }
      } catch (e) {
        // stay not-ready; collect() will surface a clear message
      }
    },
    [available]
  );

  const connect = useCallback(async () => {
    // Square authorizes during init(); there is no separate reader handshake.
    return { ok: readyRef.current };
  }, []);

  const collect = useCallback(
    async (order, { onPhase }) => {
      if (!available) {
        return { ok: false, message: 'Square is not available in this build.' };
      }
      onPhase(PHASES.INITIALIZING, 'Starting Square payment...');
      try {
        const amountCents = Math.round(Number(order.total_amount) * 100);
        const idempotencyKey = `pos-${order.id}-${Date.now()}`;

        onPhase(PHASES.TAPPING, 'Hold card near the top of this phone...');
        const payment = await sqStartPayment(
          {
            amountMoney: { amount: amountCents, currencyCode: 'USD' },
            idempotencyKey,
            referenceId: `POS-${order.id}`,
            note: `Order #${order.id}`,
          },
          { mode: 'DEFAULT' }
        );

        onPhase(PHASES.PROCESSING, 'Finalizing...');
        return { ok: true, transactionId: payment.id, paymentMethod: 'tap_to_pay' };
      } catch (e) {
        if (e.message?.includes('cancel') || e.code === 'CANCELED') {
          return { ok: false, message: 'Payment was cancelled.' };
        }
        return { ok: false, message: e.message || 'Square payment failed. Please try again.' };
      }
    },
    [available]
  );

  return { provider: 'square', ready, available, init, connect, collect };
}

export default useSquareTerminalAdapter;
