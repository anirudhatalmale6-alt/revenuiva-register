import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getBrand } from './brand';

/**
 * Tap to Pay on iPhone helper — tracks the merchant enablement state and
 * supplies the per-practice reader configuration. Backs the Apple review
 * requirements around Enabling (3.x), Educating (4.x) and the iOS version
 * guard (1.4). Stripe Terminal is the approved PSP; this module only holds
 * local state + config, the SDK does the actual card reading.
 */

const KEY_ENABLED = 'ttp_enabled';       // merchant has completed the enable + T&C flow
const KEY_INTRO_SEEN = 'ttp_intro_seen'; // awareness moment shown at least once

// Apple requires iOS 16.4+ for Tap to Pay; iOS < 17.6 needs explicit
// osVersionNotSupported handling (checklist 1.4).
const MIN_MAJOR = 16;
const MIN_MINOR = 4;

// Platform default Stripe location (kept so already-paired devices that don't
// yet carry a per-practice location in their activation config keep working).
const DEFAULT_LOCATION_ID = 'tml_GjckgyoJFmc1L9';

function parseVersion(v) {
  const parts = String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
  return { major: parts[0] || 0, minor: parts[1] || 0 };
}

/** True when the current device OS can run Tap to Pay on iPhone at all. */
export function isOsSupported() {
  if (Platform.OS !== 'ios') return true; // Android path uses its own reader
  const { major, minor } = parseVersion(Platform.Version);
  if (major > MIN_MAJOR) return true;
  if (major === MIN_MAJOR && minor >= MIN_MINOR) return true;
  return false;
}

/** User-facing message when the OS is too old (checklist 1.4). */
export function osUnsupportedMessage() {
  return 'Tap to Pay on iPhone needs iOS 16.4 or later. Please update this iPhone in Settings > General > Software Update, then reopen the app.';
}

export async function isEnabled() {
  return (await SecureStore.getItemAsync(KEY_ENABLED)) === '1';
}

export async function markEnabled() {
  await SecureStore.setItemAsync(KEY_ENABLED, '1');
}

export async function hasSeenIntro() {
  return (await SecureStore.getItemAsync(KEY_INTRO_SEEN)) === '1';
}

export async function markIntroSeen() {
  await SecureStore.setItemAsync(KEY_INTRO_SEEN, '1');
}

/** Reset — used when re-pairing to another practice. */
export async function clearTapToPay() {
  await SecureStore.deleteItemAsync(KEY_ENABLED);
  await SecureStore.deleteItemAsync(KEY_INTRO_SEEN);
}

/**
 * Per-practice reader configuration. Pulls the Stripe location + display
 * name from the activation config so the master binary skins itself instead
 * of hard-coding a single practice.
 */
export async function readerConfig() {
  let cfg = {};
  try {
    const raw = await SecureStore.getItemAsync('activation_config');
    if (raw) cfg = JSON.parse(raw) || {};
  } catch (e) {}
  const brand = getBrand();
  const stripe = cfg.stripe || cfg.payment || {};
  return {
    // Per-practice Stripe location from activation config; falls back to the
    // platform default so existing paired devices keep working.
    locationId: stripe.locationId || cfg.stripeLocationId || DEFAULT_LOCATION_ID,
    merchantDisplayName:
      brand.practiceName || cfg.companyName || cfg.practiceName || 'RevenuivaAI',
  };
}

/** Roles allowed to accept the Tap to Pay Terms & Conditions (checklist 3.8). */
const ADMIN_ROLES = [
  'owner', 'admin', 'super_admin', 'super-admin', 'superadmin',
  'org_admin', 'org-admin', 'orgadmin', 'manager', 'practice_admin',
];

/**
 * Whether the signed-in user may enable Tap to Pay / accept T&C.
 * Unknown/empty role falls back to allowed (a paired practice account),
 * but explicit non-admin roles (e.g. front desk / staff) are blocked so the
 * app can surface the "contact an administrator" message (checklist 3.8.1).
 */
export async function canAcceptTerms() {
  const role = ((await SecureStore.getItemAsync('user_role')) || '').toLowerCase().trim();
  if (!role) return true;
  return ADMIN_ROLES.includes(role);
}
