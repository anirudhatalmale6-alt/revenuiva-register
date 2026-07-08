import { useStripeTerminalAdapter } from './useStripeTerminalAdapter';
import { useSquareTerminalAdapter } from './useSquareTerminalAdapter';

/**
 * useTerminal — resolves the active payment processor for the signed-in
 * practice into a single PaymentTerminal object (see PaymentTerminal.js).
 *
 * The screens consume ONLY this. Both adapter hooks are always called (React
 * rules of hooks) but only the one matching `provider` is returned, so adding
 * a processor is: write an adapter, add one line to the registry below.
 *
 * `provider` comes from the backend gateway-info for the practice
 * (getProviderInfo). Defaults to Stripe.
 */
export function useTerminal(provider) {
  const stripe = useStripeTerminalAdapter();
  const square = useSquareTerminalAdapter();

  const registry = {
    stripe,
    square,
  };

  return registry[provider] || stripe;
}

export default useTerminal;
