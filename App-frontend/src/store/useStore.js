import { create } from 'zustand';
import apiService from '../services/apiService';
import authStorage from '../utils/authStorage';
import { Alert } from 'react-native';

export const useStore = create((set, get) => ({
  persons: [],
  debts: [],
  settlements: [],
  notifications: [],
  groups: [],
  gamification: null,
  // Cached result of the last device-contact sync, so revisiting the Contacts tab is instant
  // instead of re-reading the whole address book and re-hitting the network.
  deviceContacts: [],
  lastContactSyncAt: null,
  // Group invite code captured from a deep link, held until the user is signed in
  // (joining requires a JWT, and the link may well arrive while logged out).
  pendingJoinCode: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Auth
  setAuthenticated: async (token) => {
    if (!token) return;
    await authStorage.setToken(token);
    set({ isAuthenticated: true });
    // Fetch data immediately after authentication
    get().fetchData();
  },

  checkAuth: async () => {
    const token = await authStorage.getToken();
    if (token) {
      set({ isAuthenticated: true });
    } else {
      set({ isAuthenticated: false });
    }
  },

  logout: async () => {
    await authStorage.removeToken();
    set({
      isAuthenticated: false,
      user: null,
      persons: [],
      debts: [],
      settlements: [],
      notifications: [],
      groups: [],
      gamification: null,
      deviceContacts: [],
      lastContactSyncAt: null,
      pendingJoinCode: null,
      error: null
    });
  },

  // Fetching
  fetchData: async () => {
    // 1. Requirement check
    if (!get().isAuthenticated) return;
    
    // 2. State management
    set({ isLoading: true, error: null });
    
    try {
      const [persons, debts, settlements, user, notifications, groups, gamification] = await Promise.all([
        apiService.getPersons(),
        apiService.getDebts(),
        apiService.getSettlements(),
        apiService.getProfile(),
        apiService.getNotifications().catch(() => []),
        apiService.getGroups().catch(() => []),
        apiService.getGamification().catch(() => null),
      ]);
      set({ persons, debts, settlements, user, notifications, groups, gamification, isLoading: false });
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Network error';
      set({ error: errorMessage, isLoading: false });
      
      // Handle Unauthenticated specifically
      if (err.response && err.response.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
        get().logout();
      } else {
        // Only show alert for non-auth errors if we have no data
        if (get().persons.length === 0) {
          Alert.alert('Connection Error', 'Could not sync data with the server. Please check your connection.');
        }
      }
    }
  },

  // Persons
  addPerson: async (payload) => {
    try {
      const newPerson = await apiService.addPerson(payload);
      set((state) => ({ persons: [...state.persons, newPerson] }));
      return newPerson;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add person';
      set({ error: msg });
      throw err;
    }
  },

  deletePerson: async (id) => {
    try {
      await apiService.deletePerson(id);
      set((state) => ({ persons: state.persons.filter(p => p.id !== id) }));
      // Refetch settlements as they will change after person deletion
      get().fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete person';
      set({ error: msg });
      throw err;
    }
  },

  updateProfilePhone: async (phone) => {
    try {
      const updatedUser = await apiService.updateProfilePhone(phone);
      set({ user: updatedUser });
      return updatedUser;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update phone number';
      set({ error: msg });
      throw err;
    }
  },

  // Debts
  addDebt: async (debtData) => {
    try {
      const newDebt = await apiService.addDebt(debtData);

      // Recording can settle/collapse existing rows on the server (netting a whole
      // relationship), so re-sync debts and settlements from the source of truth
      // rather than appending a single row locally.
      const [debts, settlements] = await Promise.all([
        apiService.getDebts(),
        apiService.getSettlements(),
      ]);
      set({ debts, settlements });
      return newDebt;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to record transaction';
      set({ error: msg });
      throw err;
    }
  },

  acceptDebt: async (id) => {
    try {
      await apiService.acceptDebt(id);
      await get().resyncDebts();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to accept debt';
      set({ error: msg });
      throw err;
    }
  },

  declineDebt: async (id) => {
    try {
      await apiService.declineDebt(id);
      await get().resyncDebts();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to decline debt';
      set({ error: msg });
      throw err;
    }
  },

  restoreDebt: async (id) => {
    try {
      await apiService.restoreDebt(id);
      await get().resyncDebts();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to restore debt';
      set({ error: msg });
      throw err;
    }
  },

  markNotificationsRead: async () => {
    // Optimistically mark read locally, then tell the server.
    set((state) => ({ notifications: state.notifications.map(n => ({ ...n, read: true })) }));
    try {
      await apiService.markNotificationsRead();
    } catch (err) {
      // non-fatal
    }
  },

  // Re-sync the bits that change when a debt is accepted/declined/restored/simplified.
  resyncDebts: async () => {
    const [debts, settlements, notifications] = await Promise.all([
      apiService.getDebts(),
      apiService.getSettlements(),
      apiService.getNotifications().catch(() => get().notifications),
    ]);
    set({ debts, settlements, notifications });
  },

  setPendingJoinCode: (code) => set({ pendingJoinCode: code }),

  // Device contacts (cached between visits to the Circle > Contacts tab)
  setDeviceContacts: (contacts) =>
    set({ deviceContacts: contacts, lastContactSyncAt: Date.now() }),

  markContactAsFriend: (phoneNumber) =>
    set((state) => ({
      deviceContacts: state.deviceContacts.map((c) =>
        c.phoneNumber === phoneNumber ? { ...c, isFriend: true } : c
      ),
    })),

  markContactAsNotFriend: (phoneNumber) =>
    set((state) => ({
      deviceContacts: state.deviceContacts.map((c) =>
        c.phoneNumber === phoneNumber ? { ...c, isFriend: false } : c
      ),
    })),

  // Groups
  createGroup: async (name) => {
    const group = await apiService.createGroup(name);
    set((state) => ({ groups: [...state.groups, group] }));
    return group;
  },
  joinGroup: async (code) => {
    const group = await apiService.joinGroup(code);
    const groups = await apiService.getGroups().catch(() => get().groups);
    set({ groups });
    return group;
  },
  leaveGroup: async (id) => {
    await apiService.leaveGroup(id);
    set((state) => ({ groups: state.groups.filter((g) => g.id !== id) }));
  },

  // Gamification
  fetchGamification: async () => {
    const gamification = await apiService.getGamification().catch(() => get().gamification);
    set({ gamification });
  },

  // Profile (name / phone / privacy / notifications)
  updateMyProfile: async (payload) => {
    const user = await apiService.updateMyProfile(payload);
    set({ user });
    return user;
  },

  // Deactivate: the backend refuses while any balance is outstanding, so a rejection here
  // is expected and its message is worth showing verbatim.
  deactivateAccount: async () => {
    await apiService.deactivateAccount();
    await get().logout();
  },

  updateDebt: async (id, debtData) => {
    try {
      const updatedDebt = await apiService.updateDebt(id, debtData);
      set((state) => ({ 
        debts: state.debts.map(d => d.id === id ? updatedDebt : d) 
      }));
      // Update settlements immediately
      const settlements = await apiService.getSettlements();
      set({ settlements });
      return updatedDebt;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update transaction';
      set({ error: msg });
      throw err;
    }
  },

  deleteDebt: async (id) => {
    try {
      await apiService.deleteDebt(id);
      // Soft-delete keeps the row (status DELETED) so it stays visible in history -
      // re-sync from the server rather than dropping it locally.
      await get().resyncDebts();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete transaction';
      set({ error: msg });
      throw err;
    }
  },
}));
