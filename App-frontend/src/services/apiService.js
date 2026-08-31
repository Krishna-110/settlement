import axios from 'axios';
import authStorage from '../utils/authStorage';

// Backend host. Override at build time with EXPO_PUBLIC_BACKEND_URL to point a build at a
// different server (e.g. the old Render instance) without editing this file.
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://settlementapi.ssbpgc.com';
const API_BASE_URL = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response Interceptor: Handle auth errors (e.g., token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Logic for force logout can be added here
      await authStorage.removeToken();
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // Authentication Trigger URL
  getAuthUrl: () => `${BACKEND_URL}/oauth2/authorization/google`,

  // Profile
  getProfile: async () => {
    const response = await api.get('/profile');
    return response.data;
  },

  // Persons
  getPersons: async () => {
    const response = await api.get('/persons');
    return response.data;
  },
  addPerson: async (payload) => {
    const response = await api.post('/persons', payload);
    return response.data;
  },
  checkPersonExists: async (phone) => {
    const response = await api.get(`/persons/check?phone=${encodeURIComponent(phone)}`);
    return response.data;
  },
  deletePerson: async (id) => {
    await api.delete(`/persons/${id}`);
  },

  // Debts
  getDebts: async () => {
    const response = await api.get('/debts');
    return response.data;
  },
  addDebt: async (debtData) => {
    const response = await api.post('/debts', debtData);
    return response.data;
  },
  acceptDebt: async (id) => {
    const response = await api.post(`/debts/${id}/accept`, {});
    return response.data;
  },
  declineDebt: async (id) => {
    const response = await api.post(`/debts/${id}/decline`, {});
    return response.data;
  },
  restoreDebt: async (id) => {
    const response = await api.post(`/debts/${id}/restore`, {});
    return response.data;
  },
  updateDebt: async (id, debtData) => {
    const response = await api.put(`/debts/${id}`, debtData);
    return response.data;
  },
  deleteDebt: async (id) => {
    await api.delete(`/debts/${id}`);
  },

  // Settlements
  getSettlements: async () => {
    const response = await api.get('/settle');
    return response.data;
  },

  // Notifications
  getNotifications: async () => {
    const response = await api.get('/notifications');
    return response.data;
  },
  markNotificationsRead: async () => {
    await api.post('/notifications/read', {});
  },

  // Groups
  getGroups: async () => {
    const response = await api.get('/groups');
    return response.data;
  },
  createGroup: async (name) => {
    const response = await api.post('/groups', { name });
    return response.data;
  },
  joinGroup: async (code) => {
    const response = await api.post('/groups/join', { code });
    return response.data;
  },
  leaveGroup: async (id) => {
    await api.post(`/groups/${id}/leave`, {});
  },

  // Gamification
  getGamification: async () => {
    const response = await api.get('/gamification/me');
    return response.data;
  },

  // Profile
  updateMyProfile: async (payload) => {
    const response = await api.put('/persons/me', payload);
    return response.data;
  },
  deactivateAccount: async () => {
    const response = await api.post('/persons/me/deactivate', {});
    return response.data;
  },

  // Phone Support
  updateProfilePhone: async (phone) => {
    const response = await api.put('/persons/me/phone', { phone });
    return response.data;
  },
  syncBatchContacts: async (contacts) => {
    const response = await api.post('/persons/sync-batch', contacts);
    return response.data;
  },
  checkBatchContacts: async (phoneNumbers) => {
    const response = await api.post('/persons/check-contacts', phoneNumbers);
    return response.data;
  },
};

export default apiService;
export { BACKEND_URL };
