import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '../theme/Theme';
import { ChevronRight, Check } from 'lucide-react-native';
import Logo from '../components/Logo';
import TermsModal from '../components/TermsModal';
import PrivacyModal from '../components/PrivacyModal';
import termsStorage from '../utils/termsStorage';
import * as WebBrowserInstance from 'expo-web-browser';
import * as Linking from 'expo-linking';
import apiService from '../services/apiService';
import { useStore } from '../store/useStore';

// Required for Auth Session handling
WebBrowserInstance.maybeCompleteAuthSession();

const { width, height } = Dimensions.get('window');

const LandingScreen = () => {
  const { setAuthenticated, checkAuth } = useStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // Animations
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentMove = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Check if already authenticated on mount
    checkAuth();
    // Restore any previously-given Terms & Conditions acceptance, so returning users
    // aren't forced to re-check the box every time they land here.
    termsStorage.getAccepted().then(setTermsAccepted);

    // Content entrance
    Animated.parallel([
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(contentMove, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating blobs animation
    const createLoop = (anim, toValue) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
    };

    createLoop(blob1Anim, 20).start();
    createLoop(blob2Anim, -20).start();
  }, []);

  // No navigate() on sign-in: App.js swaps the whole Stack when isAuthenticated flips, so 'Main'
  // replaces 'Landing' on its own. Calling navigate here raced that swap and could fire before
  // 'Main' was registered, which React Navigation reports as an unhandled action.

  const toggleTermsAccepted = () => {
    const next = !termsAccepted;
    setTermsAccepted(next);
    termsStorage.setAccepted(next);
  };

  const handleGetStarted = async () => {
    if (isAuthenticating || !termsAccepted) return;

    setIsAuthenticating(true);
    const authUrl = apiService.getAuthUrl();
    // Must match EXACTLY the deep link the backend redirects to
    // (app.frontend.redirect-uri = cleardues://--/login-success), otherwise the auth session
    // won't recognize the completion URL and the token is dropped.
    const redirectUrl = 'cleardues://--/login-success';

    try {
      const result = await WebBrowserInstance.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        handleRedirect(result.url);
      }
    } catch (error) {
      console.error('Auth error', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRedirect = (url) => {
    try {
      const { queryParams } = Linking.parse(url);
      if (queryParams && queryParams.token) {
        // Storing the token is all that's needed - App.js renders 'Main' instead of 'Landing'
        // as soon as isAuthenticated flips, so there is nothing to navigate to by hand.
        setAuthenticated(queryParams.token);
      }
    } catch (err) {
      console.error('Redirect parse error', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Blobs */}
      <Animated.View 
        style={[
          styles.blob, 
          styles.blob1, 
          { transform: [{ translateY: blob1Anim }, { translateX: blob1Anim }] }
        ]} 
      />
      <Animated.View 
        style={[
          styles.blob, 
          styles.blob2, 
          { transform: [{ translateY: blob2Anim }, { translateX: blob2Anim }] }
        ]} 
      />

      <View style={styles.content}>
        <Animated.View style={[styles.mainContainer, { opacity: contentFade, transform: [{ translateY: contentMove }] }]}>
          <View style={styles.logoContainer}>
            <Logo size={168} />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title}>Settlement</Text>
            <View style={styles.pillTag}>
              <Text style={styles.pillText}>SMART SETTLEMENTS</Text>
            </View>
            <Text style={styles.subtitle}>
              Track, manage, and settle shared expenses with zero stress. The professional way to stay square.
            </Text>
          </View>

          <View style={styles.buttonWrapper}>
            <TouchableOpacity style={styles.termsRow} onPress={toggleTermsAccepted} activeOpacity={0.7}>
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Check size={14} color={Theme.colors.white} strokeWidth={3} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink} onPress={() => setTermsModalVisible(true)}>
                  Terms & Conditions
                </Text>
                {' '}and{' '}
                <Text style={styles.termsLink} onPress={() => setPrivacyModalVisible(true)}>
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.button,
                Theme.shadow.medium,
                (isAuthenticating || !termsAccepted) && { opacity: 0.5 }
              ]}
              onPress={handleGetStarted}
              disabled={isAuthenticating || !termsAccepted}
            >
              <Text style={styles.buttonText}>
                {isAuthenticating ? 'Authenticating...' : 'Get Started'}
              </Text>
              <View style={styles.buttonIcon}>
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color={Theme.colors.white} />
                ) : (
                  <ChevronRight size={18} color={Theme.colors.white} />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>MODERN • SECURE • SIMPLE</Text>
      </View>

      <TermsModal visible={termsModalVisible} onClose={() => setTermsModalVisible(false)} />
      <PrivacyModal visible={privacyModalVisible} onClose={() => setPrivacyModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.white,
  },
  blob: {
    position: 'absolute',
    borderRadius: 200,
    opacity: 0.08,
  },
  blob1: {
    width: 300,
    height: 300,
    backgroundColor: Theme.colors.primary,
    top: -50,
    right: -50,
  },
  blob2: {
    width: 250,
    height: 250,
    backgroundColor: Theme.colors.secondary,
    bottom: 50,
    left: -50,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.xl,
  },
  mainContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    width: 168,
    height: 168,
    marginBottom: Theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,             // ~matches the logo's rounded corners (100/500 * 168)
    backgroundColor: '#1A1D24',   // same as the mark, so the badge reads as one solid shape
    // soft elevation so the dark badge lifts off the white background
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 14,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: -1.5,
    marginBottom: 8,
  },
  pillTag: {
    backgroundColor: Theme.colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 20,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.colors.primary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Theme.spacing.md,
  },
  buttonWrapper: {
    width: '100%',
    paddingHorizontal: Theme.spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  termsText: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
  },
  termsLink: {
    color: Theme.colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  button: {
    backgroundColor: Theme.colors.text,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 8,
  },
  buttonText: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginRight: 12,
  },
  buttonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: Theme.spacing.xl,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
    letterSpacing: 2,
  },
});

export default LandingScreen;
