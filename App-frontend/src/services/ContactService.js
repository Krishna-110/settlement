import * as Contacts from 'expo-contacts';
import { Linking } from 'react-native';

/**
 * Normalizes phone numbers to a 10-digit format.
 * Strips non-numeric characters and removes the '91' prefix if present.
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If it starts with 91 and is longer than 10 digits, remove the 91 prefix
  if (cleaned.length > 10 && cleaned.startsWith('91')) {
    cleaned = cleaned.substring(cleaned.length - 10);
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Return the last 10 digits if it's a valid length, otherwise return null or original
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  return null; // Ignore invalid formats for sync
};

/**
 * Requests contact permissions from the user, returning granted and canAskAgain status.
 */
export const requestContactPermission = async () => {
  try {
    const current = await Contacts.getPermissionsAsync();
    if (current.status === 'granted') {
      return { granted: true, canAskAgain: current.canAskAgain };
    }
    if (current.canAskAgain) {
      const res = await Contacts.requestPermissionsAsync();
      return { granted: res.status === 'granted', canAskAgain: res.canAskAgain };
    }
    return { granted: false, canAskAgain: false };
  } catch (e) {
    console.warn('Contact permission error:', e);
    return { granted: false, canAskAgain: true };
  }
};

/**
 * Fetches and normalizes all contacts from the device.
 */
export const getDeviceContacts = async () => {
  try {
    const perm = await Contacts.getPermissionsAsync();
    if (perm.status !== 'granted') return [];

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    if (data.length > 0) {
      const contactMap = new Map();
      
      data.forEach(contact => {
        if (contact.phoneNumbers) {
          contact.phoneNumbers.forEach(p => {
            const normalized = normalizePhoneNumber(p.number);
            if (normalized) {
              // Store unique normalized numbers
              contactMap.set(normalized, {
                id: contact.id,
                name: contact.name,
                phoneNumber: normalized,
                originalNumber: p.number
              });
            }
          });
        }
      });
      
      return Array.from(contactMap.values());
    }
  } catch (e) {
    console.warn('Error fetching device contacts:', e);
  }
  return [];
};

/**
 * Re-triggers the native permission dialog when canAskAgain is true.
 */
export const promptContactPermissionAgain = async () => {
  try {
    return await Contacts.requestPermissionsAsync();
  } catch (e) {
    console.warn('Error requesting contact permission:', e);
    return { status: 'denied', canAskAgain: false };
  }
};

/**
 * Opens device app settings when permissions are permanently disabled.
 */
export const openAppSettings = () => {
  Linking.openSettings();
};
