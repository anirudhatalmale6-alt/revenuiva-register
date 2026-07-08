/**
 * PaymentTerminal — the processor-agnostic contract every payment backend
 * (Stripe today, Square next, others later) must satisfy. The app UI depends
 * ONLY on this shape; it never imports a processor SDK directly. To add a new
 * processor you write one adapter that returns this interface and register it
 * in useTerminal — no changes to the screens or the payment flow.
 *
 * Each adapter is a React hook (so hook-based SDKs like Stripe Terminal work)
 * returning an object of this shape:
 *
 *   {
 *     provider: 'stripe' | 'square' | ...   // which backend this adapter is
 *     ready:    boolean                      // reader connected / authorized
 *     available:boolean                      // native SDK present in this build
 *
 *     // One-time setup (SDK init / authorization). `info` is the gateway-info
 *     // payload from the backend (provider, keys, location). Safe to call more
 *     // than once.
 *     init(info): Promise<void>
 *
 *     // Connect / warm up the contactless reader (Tap to Pay). Returns a
 *     // structured result rather than throwing, so the UI can decide what to
 *     // show. `message` is a user-facing string when we already know one
 *     // (e.g. unsupported iOS version).
 *     connect(): Promise<{ ok: boolean, message?: string, error?: any }>
 *
 *     // Take payment for an order end to end. The adapter owns every
 *     // processor-specific step (create intent, read card, confirm) and drives
 *     // the shared UI phases through onPhase so the screen looks identical no
 *     // matter which processor is live.
 *     //
 *     //   onPhase(phase, statusMsg?)   phase ∈ PHASES below
 *     //
 *     // On success returns the processor's transaction id; the caller then
 *     // finalizes the order on our backend (confirmPayment). On failure returns
 *     // a user-facing message.
 *     collect(order, { onPhase }): Promise<{
 *       ok: boolean,
 *       transactionId?: string,
 *       paymentMethod?: string,   // e.g. 'tap_to_pay'
 *       message?: string,
 *     }>
 *   }
 */

// Shared UI phases the terminal screen renders. Adapters emit these via
// onPhase so the visual flow (initializing -> tapping -> processing) is
// consistent across every processor.
export const PHASES = {
  INITIALIZING: 'initializing', // reader warming up / creating the charge
  TAPPING: 'tapping',           // prompt the customer to hold their card
  PROCESSING: 'processing',     // card read, transaction underway
};

export default PHASES;
