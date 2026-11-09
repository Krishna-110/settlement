import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, BackHandler } from 'react-native';
import { Theme } from '../theme/Theme';
import TermsModal from './TermsModal';
import PrivacyModal from './PrivacyModal';
import termsStorage from '../utils/termsStorage';

// First-launch gate: the "calculation tool only" disclaimer plus acceptance of the Terms and
// Privacy Policy, in one step. "Yes" is stored; "No" closes the app without storing anything,
// so the notice returns on the next launch. BackHandler.exitApp is Android-only (iOS forbids it).
// The legal modals live inside this Modal so they stack above it.
const FirstLaunchNotice = () => {
  const [visible, setVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  useEffect(() => {
    termsStorage.getAccepted().then((accepted) => setVisible(!accepted));
  }, []);

  const accept = () => {
    termsStorage.setAccepted(true);
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to the Settlement App</Text>
          <Text style={styles.body}>
            This app helps you calculate and manage group debts with transparency.
          </Text>

          <Text style={styles.heading}>⚠️ Important Notice:</Text>
          <Text style={styles.bullet}>• No debit or credit transactions happen here.</Text>
          <Text style={styles.bullet}>
            • The app does <Text style={styles.bold}>not</Text> transfer money or settle accounts automatically.
          </Text>
          <Text style={styles.bullet}>• It is only a calculation and tracking tool.</Text>

          <Text style={styles.body}>
            By tapping Yes, you confirm you understand this and agree to the{' '}
            <Text style={styles.link} onPress={() => setTermsVisible(true)}>Terms & Conditions</Text>
            {' '}and{' '}
            <Text style={styles.link} onPress={() => setPrivacyVisible(true)}>Privacy Policy</Text>.
            {'\n'}If not, please exit the app.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.noBtn]} onPress={() => BackHandler.exitApp()}>
              <Text style={styles.noText}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.yesBtn]} onPress={accept}>
              <Text style={styles.yesText}>Yes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
      <PrivacyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Theme.spacing.lg,
  },
  card: { backgroundColor: Theme.colors.white, borderRadius: Theme.borderRadius.xl, padding: Theme.spacing.lg },
  title: { fontSize: 20, fontWeight: '800', color: Theme.colors.text, marginBottom: Theme.spacing.sm },
  body: { fontSize: 15, color: Theme.colors.textSecondary, lineHeight: 22, marginTop: Theme.spacing.sm },
  heading: { fontSize: 15, fontWeight: '800', color: Theme.colors.text, marginTop: Theme.spacing.md, marginBottom: 4 },
  bullet: { fontSize: 15, color: Theme.colors.textSecondary, lineHeight: 22, marginTop: 4 },
  bold: { fontWeight: '800', color: Theme.colors.text },
  link: { color: Theme.colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', marginTop: Theme.spacing.lg, gap: Theme.spacing.sm },
  btn: { flex: 1, borderRadius: Theme.borderRadius.lg, alignItems: 'center', paddingVertical: 14 },
  noBtn: { backgroundColor: Theme.colors.surface, borderWidth: 1, borderColor: Theme.colors.border },
  yesBtn: { backgroundColor: Theme.colors.primary },
  noText: { color: Theme.colors.text, fontWeight: '800', fontSize: 16 },
  yesText: { color: Theme.colors.white, fontWeight: '800', fontSize: 16 },
});

export default FirstLaunchNotice;
