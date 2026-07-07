import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Animated, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { COLORS, FONTS } from '../config/theme';
import { getBrand } from '../services/brand';
import {
  isOsSupported, osUnsupportedMessage, markEnabled, markIntroSeen,
  canAcceptTerms, readerConfig,
} from '../services/tapToPay';

/**
 * Enable Tap to Pay on iPhone — the one-time flow Apple's App Review requires
 * before checkout. Four moments:
 *   1. Awareness     (checklist 3.1 / 3.2)
 *   2. Education      (checklist 4.x)
 *   3. Enable + Terms (checklist 3.5 / 3.8 / 3.8.1)  — admin only
 *   4. Configuring    (checklist 3.9.1 progress indicator) → Ready (3.9)
 */
export default function EnableTapToPayScreen({ navigation, route }) {
  const brand = getBrand();
  const accent = brand.primaryColor || COLORS.primary;
  // Help mode: opened from the terminal to re-read the education (checklist 4.3).
  const helpMode = route?.params?.mode === 'help';

  const [step, setStep] = useState(helpMode ? 'education' : 'intro'); // intro | education | enable | progress | ready
  const [authorized, setAuthorized] = useState(true);
  const [osOk, setOsOk] = useState(true);
  const [error, setError] = useState('');
  const [progressLabel, setProgressLabel] = useState('Preparing…');

  const progress = useRef(new Animated.Value(0)).current;
  const progressTimer = useRef(null);
  const connecting = useRef(false);

  const { easyConnect, initialize: initTerminal } = useStripeTerminal({
    onDidChangeConnectionStatus: (status) => {
      if (status === 'connecting') advanceProgress(0.85, 'Configuring reader…');
      if (status === 'connected') finishProgress();
    },
  });

  useEffect(() => {
    (async () => {
      setOsOk(isOsSupported());
      setAuthorized(await canAcceptTerms());
      await markIntroSeen();
    })();
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, []);

  // Drive a determinate progress bar toward a ceiling while the reader
  // configures — the PSP-SDK equivalent of PaymentCardReader updateProgress.
  const advanceProgress = useCallback((ceiling, label) => {
    if (label) setProgressLabel(label);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      progress.stopAnimation((cur) => {
        const next = Math.min(ceiling, cur + 0.04 + Math.min(0.03, ceiling - cur) * 0.1);
        Animated.timing(progress, { toValue: next, duration: 250, useNativeDriver: false }).start();
        if (next >= ceiling && progressTimer.current) {
          clearInterval(progressTimer.current);
          progressTimer.current = null;
        }
      });
    }, 260);
  }, [progress]);

  const finishProgress = useCallback(() => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    setProgressLabel('Ready');
    Animated.timing(progress, { toValue: 1, duration: 300, useNativeDriver: false }).start(async () => {
      await markEnabled();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('ready');
    });
  }, [progress]);

  const handleEnable = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setError('');
    setStep('progress');
    progress.setValue(0.05);
    advanceProgress(0.4, 'Starting Tap to Pay…');
    try {
      await initTerminal();
      const cfg = await readerConfig();
      // easyConnect surfaces Apple's native Terms & Conditions sheet on first
      // enablement (tosAcceptancePermitted) — the admin accepts there.
      const { reader, error: connErr } = await easyConnect({
        discoveryMethod: 'tapToPay',
        simulated: false,
        locationId: cfg.locationId,
        merchantDisplayName: cfg.merchantDisplayName,
        tosAcceptancePermitted: true,
        autoReconnectOnUnexpectedDisconnect: true,
      });
      if (connErr) {
        connecting.current = false;
        return failEnable(connErr);
      }
      if (reader) {
        // connection-status callback also fires; ensure we finish either way.
        finishProgress();
      }
    } catch (e) {
      connecting.current = false;
      failEnable(e);
    }
  };

  const failEnable = (e) => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    const code = e?.code || '';
    let msg = e?.message || 'Could not enable Tap to Pay. Please try again.';
    if (String(code).toLowerCase().includes('osversion') ||
        String(msg).toLowerCase().includes('os version')) {
      msg = osUnsupportedMessage();
    }
    setError(msg);
    setStep('enable');
    progress.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const widthInterpolate = progress.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  // ── OS not supported (checklist 1.4) ─────────────────────
  if (!osOk) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.blockWrap}>
          <View style={[s.iconBubble, { backgroundColor: COLORS.warningBg }]}>
            <Text style={s.bubbleGlyph}>⚠️</Text>
          </View>
          <Text style={s.blockTitle}>Update Required</Text>
          <Text style={s.blockDesc}>{osUnsupportedMessage()}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step: Awareness (3.1 / 3.2) ──────────────────────────
  if (step === 'intro') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.pageContent} bounces={false}>
          <View style={[s.hero, { backgroundColor: accent }]}>
            <Text style={s.heroGlyph}>💳</Text>
          </View>
          <Text style={s.h1}>Tap to Pay on iPhone</Text>
          <Text style={s.lead}>
            Accept contactless debit and credit cards, Apple Pay and other
            digital wallets — right here on this iPhone. No extra terminal or
            hardware needed.
          </Text>
          <View style={s.bullets}>
            <Bullet accent={accent} text="Contactless cards — just hold near the top" />
            <Bullet accent={accent} text="Apple Pay and digital wallets" />
            <Bullet accent={accent} text="Powered by Stripe, secured by Apple" />
          </View>
        </ScrollView>
        <Footer>
          <PrimaryBtn accent={accent} label="Get Started" onPress={() => setStep('education')} />
          <Text style={s.legal}>
            The Contactless Symbol is a trademark owned by and used with permission of EMVCo, LLC.
          </Text>
        </Footer>
      </SafeAreaView>
    );
  }

  // ── Step: Educating merchants (4.x) ──────────────────────
  if (step === 'education') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.pageContent} bounces={false}>
          <Text style={s.kicker}>HOW IT WORKS</Text>
          <Text style={s.h2}>Taking a payment</Text>

          <EduRow n="1" accent={accent}
            title="Enter the amount"
            body="Start a sale from an order and tap the Tap to Pay button." />
          <EduRow n="2" accent={accent}
            title="Ask for the card or phone"
            body="Hold the customer's contactless card, iPhone or Apple Watch flat against the top of this iPhone until you see the checkmark." />
          <EduRow n="3" accent={accent}
            title="Apple Pay & digital wallets"
            body="Apple Pay, Google Pay and Samsung Pay work the same way — hold the device near the top of this iPhone." />

          <View style={s.noteBox}>
            <Text style={s.noteTitle}>If a PIN is requested</Text>
            <Text style={s.noteBody}>
              Some cards ask the customer to enter a PIN on screen. Follow the
              on-screen prompts. Accessibility options are available during PIN
              entry for customers who need them.
            </Text>
          </View>
        </ScrollView>
        <Footer>
          {helpMode ? (
            <PrimaryBtn accent={accent} label="Done" onPress={() => navigation.goBack()} />
          ) : (
            <PrimaryBtn accent={accent} label="Continue" onPress={() => setStep('enable')} />
          )}
        </Footer>
      </SafeAreaView>
    );
  }

  // ── Step: Enable + Terms (3.5 / 3.8 / 3.8.1) ─────────────
  if (step === 'enable') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.pageContent} bounces={false}>
          <View style={[s.iconBubble, { backgroundColor: accent + '15' }]}>
            <Text style={[s.bubbleGlyph, { color: accent }]}>🔒</Text>
          </View>
          <Text style={s.h2}>Enable Tap to Pay</Text>
          <Text style={s.lead}>
            To finish, accept Apple's Tap to Pay on iPhone Terms & Conditions.
            You'll see Apple's confirmation sheet — this only happens once per device.
          </Text>

          {!!error && (
            <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
          )}

          {!authorized && (
            <View style={s.noteBox}>
              <Text style={s.noteTitle}>Administrator approval needed</Text>
              <Text style={s.noteBody}>
                Only an account administrator can accept the Tap to Pay Terms &
                Conditions. Please ask an administrator to sign in on this device
                and enable Tap to Pay.
              </Text>
            </View>
          )}
        </ScrollView>
        <Footer>
          {authorized ? (
            <PrimaryBtn accent={accent} label="Accept & Enable Tap to Pay" onPress={handleEnable} />
          ) : (
            <View style={[s.primaryBtn, { backgroundColor: COLORS.border }]}>
              <Text style={[s.primaryBtnText, { color: COLORS.textMuted }]}>
                Enable Tap to Pay
              </Text>
            </View>
          )}
        </Footer>
      </SafeAreaView>
    );
  }

  // ── Step: Configuring — progress indicator (3.9.1) ───────
  if (step === 'progress') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.blockWrap}>
          <View style={[s.iconBubble, { backgroundColor: accent + '15' }]}>
            <ActivityIndicator size="large" color={accent} />
          </View>
          <Text style={s.blockTitle}>Setting up Tap to Pay</Text>
          <Text style={s.blockDesc}>
            This can take a moment the first time. Please keep the app open and
            stay connected to the internet.
          </Text>
          <View style={s.progressTrack}>
            <Animated.View style={[s.progressFill, { width: widthInterpolate, backgroundColor: accent }]} />
          </View>
          <Text style={s.progressLabel}>{progressLabel}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step: Ready (3.9) ────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: COLORS.successBg }]}>
      <View style={s.blockWrap}>
        <View style={[s.iconBubble, { backgroundColor: COLORS.success }]}>
          <Text style={[s.bubbleGlyph, { color: COLORS.white }]}>✓</Text>
        </View>
        <Text style={[s.blockTitle, { color: COLORS.success }]}>You're all set</Text>
        <Text style={s.blockDesc}>
          Tap to Pay on iPhone is enabled on this device. You can start accepting
          contactless payments right away.
        </Text>
      </View>
      <Footer>
        <PrimaryBtn accent={COLORS.success} label="Try it out" onPress={() => navigation.replace('Terminal')} />
      </Footer>
    </SafeAreaView>
  );
}

/* ── small presentational helpers ── */
function Bullet({ text, accent }) {
  return (
    <View style={s.bulletRow}>
      <View style={[s.bulletDot, { backgroundColor: accent }]} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}
function EduRow({ n, title, body, accent }) {
  return (
    <View style={s.eduRow}>
      <View style={[s.eduNum, { backgroundColor: accent + '15' }]}>
        <Text style={[s.eduNumText, { color: accent }]}>{n}</Text>
      </View>
      <View style={s.eduBody}>
        <Text style={s.eduTitle}>{title}</Text>
        <Text style={s.eduDesc}>{body}</Text>
      </View>
    </View>
  );
}
function Footer({ children }) {
  return <View style={s.footer}>{children}</View>;
}
function PrimaryBtn({ label, onPress, accent }) {
  return (
    <TouchableOpacity style={[s.primaryBtn, { backgroundColor: accent }]} onPress={onPress} activeOpacity={0.85}>
      <Text style={s.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  pageContent: { padding: 28, paddingBottom: 24 },
  footer: { paddingHorizontal: 28, paddingBottom: 20, paddingTop: 8 },

  hero: {
    height: 180, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, flexDirection: 'row', gap: 8,
  },
  heroGlyph: { fontSize: 72, color: '#ffffff' },
  heroWave: { fontSize: 40 },

  kicker: { ...FONTS.bold, fontSize: 11, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 8 },
  h1: { ...FONTS.heading, fontSize: 30, marginBottom: 14 },
  h2: { ...FONTS.heading, fontSize: 26, marginBottom: 12 },
  lead: { ...FONTS.regular, fontSize: 16, lineHeight: 25, color: COLORS.textSecondary },

  bullets: { marginTop: 22, gap: 14 },
  bulletRow: { flexDirection: 'row', alignItems: 'center' },
  bulletDot: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
  bulletText: { ...FONTS.regular, fontSize: 15, color: COLORS.text, flex: 1 },

  eduRow: { flexDirection: 'row', marginTop: 20 },
  eduNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  eduNumText: { ...FONTS.bold, fontSize: 15 },
  eduBody: { flex: 1 },
  eduTitle: { ...FONTS.bold, fontSize: 16, marginBottom: 4 },
  eduDesc: { ...FONTS.regular, color: COLORS.textSecondary, lineHeight: 22 },

  noteBox: {
    backgroundColor: COLORS.warningBg, borderRadius: 14, padding: 16, marginTop: 26,
    borderWidth: 1, borderColor: '#fde68a',
  },
  noteTitle: { ...FONTS.bold, fontSize: 14, color: '#92400e', marginBottom: 6 },
  noteBody: { ...FONTS.regular, fontSize: 13, color: '#92400e', lineHeight: 20 },

  iconBubble: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 24, alignSelf: 'flex-start' },
  bubbleGlyph: { fontSize: 40 },

  blockWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 },
  blockTitle: { ...FONTS.heading, fontSize: 24, marginBottom: 12, textAlign: 'center' },
  blockDesc: { ...FONTS.regular, fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 23 },

  progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginTop: 30, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { ...FONTS.caption, marginTop: 12 },

  primaryBtn: {
    borderRadius: 14, paddingVertical: 17, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { ...FONTS.bold, color: COLORS.white, fontSize: 16 },
  legal: { ...FONTS.caption, fontSize: 10, textAlign: 'center', marginTop: 14, lineHeight: 15 },

  errorBox: { backgroundColor: COLORS.dangerBg, borderRadius: 12, padding: 14, marginTop: 20 },
  errorText: { color: COLORS.danger, fontSize: 13, lineHeight: 19 },

  iconBubbleCenter: {},
});
