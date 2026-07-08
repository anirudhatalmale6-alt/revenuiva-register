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
let sqAuthorize, sqStartPayment, sqGetAuthState, sqGetEnvironment, sqShowMockReaderUI;
let SqEnums = {};
try {
  const m = require('mobile-payments-sdk-react-native');
  sqAuthorize = m.authorize;
  sqStartPayment = m.startPayment;
  sqGetAuthState = m.getAuthorizationState;
  sqGetEnvironment = m.getEnvironment;
  sqShowMockReaderUI = m.showMockReaderUI;
  // Enums the SDK expects (numeric/string). Passing raw strings for these was
  // the cause of the earlier "undefined is not a function" — startPayment
  // requires processingMode + additionalMethods + a numeric PromptMode.
  SqEnums = {
    PromptMode: m.PromptMode,
    ProcessingMode: m.ProcessingMode,
    CurrencyCode: m.CurrencyCode,
    AdditionalPaymentMethodType: m.AdditionalPaymentMethodType,
  };
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
        // Square authorizes on-device with the merchant ACCESS TOKEN (not the
        // application_id — that's the SDK identifier set in native config).
        const token = info?.accessToken;
        const locationId = info?.locationId || (await fetchSquareLocation());
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
        // Sandbox: present the on-screen mock reader so a simulated card can
        // complete the sale (no effect / skipped in production).
        try {
          const env = sqGetEnvironment ? String(await sqGetEnvironment()) : '';
          if (/sandbox/i.test(env) && sqShowMockReaderUI) {
            await sqShowMockReaderUI();
          }
        } catch (_) { /* non-fatal */ }

        const amountCents = Math.round(Number(order.total_amount) * 100);
        const CurrencyCode = SqEnums.CurrencyCode || {};
        const ProcessingMode = SqEnums.ProcessingMode || {};
        const PromptMode = SqEnums.PromptMode || {};
        const AddMethod = SqEnums.AdditionalPaymentMethodType || {};

        onPhase(PHASES.TAPPING, 'Follow the prompt to take payment...');
        const payment = await sqStartPayment(
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
    },
    [available]
  );

  return { provider: 'square', ready, available, init, connect, collect };
}

export default useSquareTerminalAdapter;
