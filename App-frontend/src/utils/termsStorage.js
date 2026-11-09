import * as SecureStore from 'expo-secure-store';

// v2: acceptance now also covers the first-launch disclaimer (FirstLaunchNotice). The key
// changed from 'terms_accepted' so users who only ticked the old checkbox see the notice once.
const TERMS_KEY = 'terms_and_notice_accepted';

// Persists whether the user has accepted the Terms & Conditions, so they aren't asked
// again on every app open once agreed (mirrors the pattern used by authStorage.js).
export const termsStorage = {
  getAccepted: async () => {
    try {
      const value = await SecureStore.getItemAsync(TERMS_KEY);
      return value === 'true';
    } catch (error) {
      console.error('Error reading terms acceptance', error);
      return false;
    }
  },
  setAccepted: async (accepted) => {
    try {
      await SecureStore.setItemAsync(TERMS_KEY, accepted ? 'true' : 'false');
    } catch (error) {
      console.error('Error storing terms acceptance', error);
    }
  },
};

export default termsStorage;
