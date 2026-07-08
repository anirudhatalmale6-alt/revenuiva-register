import { useCallback, useRef, useState } from 'react';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { PHASES } from './PaymentTerminal';
import { collectOrder } from '../services/pos';
import { readerConfig, isOsSupported, osUnsupportedMessage } from '../services/tapToPay';

/**
 * Stripe adapter for the PaymentTerminal contract. Wraps @stripe/stripe-terminal
 * -react-native (Tap to Pay on iPhone). This is the only place in the app that
 * touches the Stripe SDK — the UI just sees the shared interface.
 */
export function useStripeTerminalAdapter() {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const setReadyBoth = (v) => {
    readyRef.current = v;
    setReady(v);
  };

  const {
    easyConnect,
    collectPaymentMethod,
    confirmPaymentIntent,
    retrievePaymentIntent,
    initialize: initTerminal,
  } = useStripeTerminal({
    onDidChangeConnectionStatus: (status) => setReadyBoth(status === 'connected'),
  });

  const init = useCallback(async () => {
    await initTerminal();
  }, [initTerminal]);

  const connect = useCallback(async () => {
    // Guard for iOS versions that can't run Tap to Pay (checklist 1.4).
    if (!isOsSupported()) {
      return { ok: false, message: osUnsupportedMessage() };
    }
    const cfg = await readerConfig();
    const { reader, error } = await easyConnect({
      discoveryMethod: 'tapToPay',
      simulated: false,
      locationId: cfg.locationId,
      tosAcceptancePermitted: true,
      autoReconnectOnUnexpectedDisconnect: true,
      merchantDisplayName: cfg.merchantDisplayName,
    });
    if (error) {
      const osErr =
        String(error.code || '').toLowerCase().includes('osversion') ||
        String(error.message || '').toLowerCase().includes('os version');
      return { ok: false, message: osErr ? osUnsupportedMessage() : undefined, error };
    }
    if (reader) {
      setReadyBoth(true);
      return { ok: true };
    }
    return { ok: false };
  }, [easyConnect]);

  const collect = useCallback(
    async (order, { onPhase }) => {
      // ── Initializing (checklist 5.7): make sure the reader is live ──
      if (!readyRef.current) {
        onPhase(PHASES.INITIALIZING, 'Setting up the reader...');
        const c = await connect();
        if (!c.ok) {
          return {
            ok: false,
            message:
              c.message ||
              'Could not activate Tap to Pay. Make sure you are connected to the internet and try again.',
          };
        }
      }

      // Create / fetch the PaymentIntent for this order on our backend.
      onPhase(PHASES.INITIALIZING, 'Loading payment details...');
      const data = await collectOrder(order.id);
      const { paymentIntent: pi, error: retrieveError } = await retrievePaymentIntent(
        data.client_secret
      );
      if (retrieveError) {
        return { ok: false, message: 'Failed to load payment: ' + retrieveError.message };
      }

      // ── Tapping (checklist 5.6): prompt to hold card ──
      onPhase(PHASES.TAPPING, 'Hold card near the top of this phone...');
      const { paymentIntent, error } = await collectPaymentMethod({ paymentIntent: pi });
      if (error) {
        const msg =
          error.code === 'Canceled'
            ? 'Card read was cancelled. Please try again.'
            : error.message || 'Could not read card. Please try again.';
        return { ok: false, message: msg };
      }

      // ── Processing (checklist 5.8): transaction underway ──
      onPhase(PHASES.PROCESSING, 'Processing payment...');
      const { paymentIntent: confirmed, error: confirmError } = await confirmPaymentIntent({
        paymentIntent,
      });
      if (confirmError) {
        return {
          ok: false,
          message: confirmError.message || 'Payment was declined. Please try a different card.',
        };
      }

      return { ok: true, transactionId: confirmed.id, paymentMethod: 'tap_to_pay' };
    },
    [connect, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent]
  );

  return { provider: 'stripe', ready, available: true, init, connect, collect };
}

export default useStripeTerminalAdapter;
