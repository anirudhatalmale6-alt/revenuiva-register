# Bringing Square Online as a Payment Processor

**Audience:** RevenuivaAI engineering + operations.
**Prerequisite reading:** `src/payments/PaymentTerminal.js` (the processor contract).

This runbook is the end-to-end recipe for making a practice process Tap to Pay
on iPhone through **Square** instead of Stripe. The app code is already
processor-agnostic (see `src/payments/`), so this is mostly account setup,
Apple/Square provisioning, and one build-config flag — **not** an app rewrite.

It mirrors the exact two-step dance we did for Stripe:
**(1) get the processor account provisioned for Tap to Pay, (2) get Apple's
entitlement for that processor as the PSP** — plus a build step to compile
Square's native SDK into the binary.

---

## 0. Big picture — what's already done vs. what's left

| Piece | Status |
|---|---|
| App-side abstraction (`PaymentTerminal` contract) | ✅ Done |
| Square adapter (`useSquareTerminalAdapter.js`) | ✅ Written, contract-complete |
| Square native SDK **compiled into the build** | ⬜ Gated off by default (this runbook turns it on) |
| Square account Tap-to-Pay provisioning | ⬜ Per practice |
| Apple Tap to Pay entitlement for **Square as PSP** | ⬜ One-time, per app |
| Backend `gateway-info` returns Square config | ⬜ Per practice |

The adapter is deliberately inert until the native SDK is present and the
backend tells a practice to use Square. Nothing below touches Stripe practices.

---

## Part A — Square account provisioning (business/ops)

Do this per practice that will use Square.

1. **Square account.** The practice needs an active Square account (or you
   onboard them under a Square OAuth app you own — recommended for
   multi-tenant, same idea as Stripe Connect).
2. **Enable Tap to Pay on iPhone on the Square account.** This is Square's
   equivalent of the Stripe Terminal provisioning we did for Salud. Tap to Pay
   on iPhone must be enabled/available for that account and region (US). If it
   isn't visible, contact Square support to enable it — it is **not** on by
   default for every account.
3. **Collect the two credentials the app needs:**
   - **Access token** (OAuth access token for that merchant/location — this is
     what the app passes to `authorize()`). Treat it like a secret.
   - **Location ID** (the Square location the device transacts under).
4. Note the account/merchant id for your own records so support tickets are easy.

> Security: store the access token server-side only, per practice. It is never
> hard-coded in the app — the app fetches it at runtime from `gateway-info`
> (see Part D).

---

## Part B — Apple Tap to Pay entitlement for Square as the PSP

Apple grants the Tap to Pay on iPhone entitlement
(`com.apple.developer.proximity-reader.payment.acceptance`) **in association
with a Payment Service Provider**. We already hold it for **Stripe**. Square is
a different PSP, so:

1. **Confirm the multi-PSP question with Apple + Square first.** Because our app
   already has the entitlement granted for Stripe, we need Apple to confirm the
   same app binary may also process through Square, or whether a separate
   entitlement note/request is required. Open this with Apple Developer Support
   (reply on the existing Tap to Pay entitlement thread) **and** with Square's
   Tap to Pay onboarding contact. **Do not assume it carries over.** This is the
   one genuinely uncertain step — get it in writing before building.
2. **Follow Square's Tap to Pay on iPhone onboarding.** Square publishes their
   own checklist/requirements for apps using their SDK for Tap to Pay (similar
   to Apple's Getting Started checklist we already completed). Expect to
   demonstrate the same enablement + checkout UX we recorded for Stripe.
3. Once Apple confirms the entitlement covers Square for our bundle
   (`com.revenuivaai.register`), we're clear to ship a Square-processing build.

The app already **declares** the entitlement in `app.json`
(`ios.entitlements`), so no app-config change is needed here — this part is
purely the Apple/Square approval.

---

## Part C — Turn on the Square native SDK in the build

This is what was missing/colliding last time. Square's native module is
**deliberately not compiled in by default** so Stripe-only builds stay clean.
Turn it on only for a build that will actually run Square.

1. **Add the dependency** (already referenced by the adapter via `require`):
   ```
   npx expo install mobile-payments-sdk-react-native
   ```
2. **Add the config plugin / native setup** per the SDK's Expo docs so prebuild
   wires up the iOS native module (CocoaPods pod, minimum iOS target, and the
   NFC/Tap-to-Pay Info.plist keys we already have).
3. **Build with Square compiled in.** Keep this behind an explicit build so a
   normal Stripe build never carries Square's native code. Practically: a
   dedicated eas profile (e.g. `square`) or an `APP_VARIANT`-style env flag that
   the config plugin reads to decide whether to include the Square pod.
4. **Verify isolation:** a Stripe-only build must still bundle and run with the
   Square module absent — the adapter's `available` flag handles that
   (`require` in try/catch). A quick `expo export` (Metro bundle) should pass
   for both variants.

> Why the gating matters: Stripe Terminal and Square's reader SDK both claim
> NFC/camera/location and their own Tap-to-Pay plumbing. Compiling both
> unconditionally is what threw the native build errors before. Gate Square so
> it's only ever in a binary that needs it.

---

## Part D — Backend: tell a practice to use Square

The app resolves its processor from `GET /pos/gateway-info` (see
`src/services/paymentProvider.js`). For a Square practice, that endpoint must
return:

```json
{
  "provider": "square",
  "supports_tap_to_pay": true,
  "publishable_key": "<Square access token for this practice>",
  "location_id": "<Square location id>"
}
```

- `provider: "square"` is what routes the app to the Square adapter (via
  `useTerminal`).
- `publishable_key` carries the Square **access token** (the adapter passes it
  to `authorize()`).
- `location_id` is read by the adapter's `fetchSquareLocation()`.

Stripe practices keep returning `provider: "stripe"` and their existing fields —
no change. Each practice record just needs a `processor` field + its stored
Square credentials.

---

## Part E — App code (already complete — reference only)

No new app code is required to add Square; the adapter already implements the
full contract:

- `src/payments/useSquareTerminalAdapter.js`
  - `init(info)` → `authorize(accessToken, locationId)`
  - `collect(order, {onPhase})` → `startPayment(...)`, emits the shared
    `initializing → tapping → processing` phases, returns
    `{ ok, transactionId, paymentMethod }`.
- `src/payments/useTerminal.js` selects it when `provider === 'square'`.
- `TerminalScreen.js` is processor-blind — it just calls `terminal.collect()`.

If Square's SDK signature differs from what the adapter assumes (auth flow,
payment params), the change is contained to that **one** adapter file — the
checkout screen and every other processor are untouched.

---

## Part F — Test & go live (per practice)

1. Backend flips the practice to `provider: "square"` with valid token +
   location.
2. Install the **Square-enabled build** on the registered iPhone, pair, log in.
3. Run the enablement flow, then a real **$1 Tap to Pay** charge; confirm the
   green success screen and that it lands in the practice's **Square**
   dashboard.
4. Only after a clean live test do you switch that practice's real traffic to
   Square.

---

## Rollback

- To move a practice back to Stripe: set `provider: "stripe"` in `gateway-info`.
  No app update needed — the app re-resolves the adapter on next launch/login.
- To pull Square out of the app entirely: ship a build without the Square build
  flag. The adapter goes inert (`available === false`); Stripe is unaffected.

---

## Open items to confirm before committing to a date

1. **Apple multi-PSP entitlement** — does our existing grant cover Square, or is
   a separate request needed? (Part B.1 — the critical unknown.)
2. **Square Tap to Pay availability** for the specific merchant accounts/region.
3. **Square SDK API specifics** — verify `authorize`/`startPayment` signatures
   against the current SDK version and adjust the adapter if needed.

Everything else is mechanical. The heavy lifting — making the app
processor-agnostic — is already done.
