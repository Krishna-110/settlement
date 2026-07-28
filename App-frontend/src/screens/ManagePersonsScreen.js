import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import { Users, Trash2, Plus, X, RefreshCw, CheckCircle2, UserPlus, Search } from 'lucide-react-native';
import { getDeviceContacts, normalizePhoneNumber } from '../services/ContactService';
import apiService from '../services/apiService';

// Ordering for the Contacts tab: people already on the app come first (the ones you can actually
// transact with), then those you've already added, then everyone else - each alphabetical.
const contactRank = (c) => {
  if (c.registered && !c.isFriend) return 0;
  if (c.registered) return 1;
  return 2;
};
const byRankThenName = (a, b) => {
  const rank = contactRank(a) - contactRank(b);
  if (rank !== 0) return rank;
  return (a.name || '').localeCompare(b.name || '');
};

const ManagePersonsScreen = () => {
  const {
    persons, fetchData, addPerson, deletePerson, isLoading, user,
    deviceContacts, lastContactSyncAt, setDeviceContacts,
    markContactAsFriend, markContactAsNotFriend,
  } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMsg, setValidationMsg] = useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('friends'); // 'friends' or 'contacts'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      const normalized = normalizePhoneNumber(newPhone);
      if (normalized && normalized.length === 10) {
        try {
          // Re-using checkPersonExists but it needs to support phone now
          // For now, I'll use the existing check but better if I had a phone check
          const res = await apiService.checkBatchContacts([normalized]);
          const contact = res[0];
          if (contact && contact.registered) {
            setValidationMsg({ type: 'success', text: `Registered User Found: ${contact.name}` });
            if (!newName) setNewName(contact.name);
          } else {
            setValidationMsg({ type: 'info', text: 'User not registered. A placeholder will be created.' });
          }
        } catch (e) {
          setValidationMsg(null);
        }
      } else {
        setValidationMsg(null);
      }
    }, 800); // only fires once the user actually pauses typing

    return () => clearTimeout(delayDebounceFn);
  }, [newPhone]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSyncContacts = async () => {
    setIsSyncing(true);
    setSearchQuery('');
    try {
      const contacts = await getDeviceContacts();
      if (contacts.length > 0) {
        const phoneNumbers = contacts.map(c => c.phoneNumber);
        
        // 1. Check which contacts are registered on Settlement
        const registrationData = await apiService.checkBatchContacts(phoneNumbers);
        const registeredMap = new Map();
        registrationData.forEach(r => registeredMap.set(r.normalized, r));

        // 2. Identify registered users to auto-add as friends
        const registeredContacts = contacts
          .filter(c => registeredMap.has(c.phoneNumber) && registeredMap.get(c.phoneNumber).registered)
          .map(c => ({
            name: registeredMap.get(c.phoneNumber).name || c.name,
            phoneNumber: c.phoneNumber
          }));

        if (registeredContacts.length > 0) {
          // Auto-sync only the registered ones
          await apiService.syncBatchContacts(registeredContacts);
        }

        // 3. Prepare the full contact list for the UI
        const friendsPhoneSet = new Set(persons.map(p => p.phoneNumber));
        const enrichedContacts = contacts.map(c => {
          const regInfo = registeredMap.get(c.phoneNumber);
          return {
            ...c,
            registered: regInfo?.registered || false,
            backendName: regInfo?.name,
            isFriend: friendsPhoneSet.has(c.phoneNumber)
          };
        }).sort(byRankThenName);

        setDeviceContacts(enrichedContacts);
        await fetchData(); // Refresh friends list

        setViewMode('contacts');
        Alert.alert(
          'Sync Complete',
          registeredContacts.length > 0
            ? `Added ${registeredContacts.length} ${registeredContacts.length === 1 ? 'contact' : 'contacts'} already on Settlement to your Circle automatically.`
            : 'None of your contacts are on Settlement yet. Invite them from the Contacts tab!'
        );
      } else {
        Alert.alert('No Contacts', 'No valid contacts with phone numbers found.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Sync Error', 'Could not sync contacts.');
    } finally {
      setIsSyncing(false);
    }
  };

  const inviteContact = (contact) => {
    const message = `Hey ${contact.name}! Join me on Settlement to track and settle our shared expenses easily. Download here: https://cleardues.app`;
    const url = `sms:${contact.phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
    Linking.openURL(url);
  };

  const addFromContacts = async (contact) => {
    setIsSubmitting(true);
    try {
      await addPerson({ 
        name: contact.backendName || contact.name, 
        phoneNumber: contact.phoneNumber 
      });
      markContactAsFriend(contact.phoneNumber);
      await fetchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to add friend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await addPerson({ 
        name: newName.trim(), 
        phoneNumber: normalizePhoneNumber(newPhone.trim()) 
      });
      setNewName('');
      setNewPhone('');
      setValidationMsg(null);
      setModalVisible(false);
      fetchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to add person.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (id, name, phoneNumber) => {
    if (!id) return;
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${name || 'this person'} from your friends? Your shared transaction history will still be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
             await deletePerson(id);
             // Match by phone (a stable identifier), not display name - a friend can be added
             // under a custom name different from their real account name.
             markContactAsNotFriend(phoneNumber);
          }
        }
      ]
    );
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  // Opening the Contacts tab shows the cached list instantly; it only syncs the very first time.
  // (Previously every tab tap re-read the whole address book and re-hit the network.)
  const openContactsTab = () => {
    setViewMode('contacts');
    setSearchQuery('');
    if (!lastContactSyncAt && !isSyncing) handleSyncContacts();
  };

  // Memoized: this list can be thousands of rows and was recomputed on every keystroke/render.
  const filteredData = useMemo(() => {
    const source = viewMode === 'friends' ? persons : deviceContacts;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter(item =>
      item?.name?.toLowerCase().includes(query) ||
      item?.phoneNumber?.toLowerCase().includes(query) ||
      item?.email?.toLowerCase().includes(query)
    );
  }, [viewMode, persons, deviceContacts, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Users size={24} color={Theme.colors.primary} />
          <Text style={styles.headerTitle}>Circle</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.syncButton, isSyncing && { opacity: 0.5 }]}
            onPress={handleSyncContacts}
            disabled={isSyncing}
          >
            {isSyncing ? <ActivityIndicator size="small" color={Theme.colors.primary} /> : <RefreshCw size={20} color={Theme.colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Plus size={20} color={Theme.colors.white} />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, viewMode === 'friends' && styles.activeTab]} 
          onPress={() => {
            setViewMode('friends');
            setSearchQuery('');
          }}
        >
          <Text style={[styles.tabText, viewMode === 'friends' && styles.activeTabText]}>My Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'contacts' && styles.activeTab]}
          onPress={openContactsTab}
        >
          <Text style={[styles.tabText, viewMode === 'contacts' && styles.activeTabText]}>Contacts</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={viewMode === 'friends' ? "Search friends by name..." : "Search contacts by name..."}
          placeholderTextColor={Theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
            <X size={16} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item, index) => (viewMode === 'friends' ? `friend-${item.id}` : `contact-${item.phoneNumber}`) || index.toString()}
        renderItem={({ item }) => (
          <View style={[styles.personCard, Theme.shadow.light]}>
            <View style={styles.personInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(item?.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.personName} numberOfLines={1}>{item?.name || 'Unknown'}</Text>
                  {viewMode === 'contacts' && item.registered && (
                    <View style={styles.registeredBadge}>
                      <CheckCircle2 size={12} color={Theme.colors.white} />
                      <Text style={styles.registeredText}>On Settlement</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.personSub}>{item?.phoneNumber || (item.email && !item.email.includes('cleardues.local') && !item.email.includes('fairshare.local') ? item.email : '')}</Text>
              </View>
            </View>
            
            {viewMode === 'friends' ? (
              <TouchableOpacity onPress={() => confirmDelete(item?.id, item?.name, item?.phoneNumber)}>
                <Trash2 size={20} color={Theme.colors.danger} opacity={0.7} />
              </TouchableOpacity>
            ) : (
              <View>
                {item.isFriend ? (
                  <View style={styles.addedBadge}>
                    <Text style={styles.addedText}>Added</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.circleAddBtn} onPress={() => addFromContacts(item)}>
                    <Plus size={24} color={Theme.colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
        // Windowing matters here - the contacts list can be thousands of rows.
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={10}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isLoading || isSyncing ? (
              <ActivityIndicator color={Theme.colors.primary} />
            ) : (
              <View style={{ alignItems: 'center', paddingHorizontal: Theme.spacing.lg }}>
                {searchQuery.trim() ? (
                  <>
                    <Search size={40} color={Theme.colors.textSecondary} style={{ opacity: 0.4, marginBottom: Theme.spacing.sm }} />
                    <Text style={[styles.emptyText, { fontWeight: '700', color: Theme.colors.text }]}>
                      No results found for "{searchQuery}"
                    </Text>
                    <Text style={[styles.emptySubText, { marginTop: 4, textAlign: 'center' }]}>
                      Check the spelling or try a different search term
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyText}>
                      {viewMode === 'friends' ? "No friends added yet." : "Sync contacts to discover people!"}
                    </Text>
                    {viewMode === 'contacts' && !isSyncing && (
                       <TouchableOpacity style={styles.retryBtn} onPress={handleSyncContacts}>
                          <Text style={styles.retryBtnText}>Sync Now</Text>
                       </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add New Person</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setNewName('');
                setNewPhone('');
                setValidationMsg(null);
              }}>
                <X size={24} color={Theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              editable={!isSubmitting}
            />
            <View style={styles.phoneInputRow}>
               <Text style={styles.phonePrefix}>+91</Text>
               <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Phone Number"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!isSubmitting}
              />
            </View>
            
            {validationMsg && (
              <Text style={[styles.validationText, { marginTop: Theme.spacing.sm, color: validationMsg.type === 'success' ? Theme.colors.primary : Theme.colors.textSecondary }]}>
                {validationMsg.text}
              </Text>
            )}

            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && { opacity: 0.7 }, { marginTop: Theme.spacing.lg }]} 
              onPress={handleAdd}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save Person</Text>
              )}
            </TouchableOpacity>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.colors.text,
    marginLeft: Theme.spacing.sm,
  },
  addButton: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.full,
  },
  addButtonText: {
    color: Theme.colors.white,
    fontWeight: '700',
    marginLeft: 4,
  },
  list: {
    padding: Theme.spacing.md,
  },
  personCard: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.sm,
  },
  personInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  personSub: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  tab: {
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.lg,
    marginRight: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.white,
  },
  activeTab: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
  },
  activeTabText: {
    color: Theme.colors.white,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  registeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '50',
  },
  registeredText: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 3,
  },
  circleAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '40',
  },
  addedBadge: {
    backgroundColor: Theme.colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  addedText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
  },
  inviteBtn: {
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  inviteText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.colors.primary,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    height: 56,
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.text,
    paddingHorizontal: Theme.spacing.md,
    borderRightWidth: 1,
    borderRightColor: Theme.colors.border,
  },
  retryBtn: {
    marginTop: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.full,
  },
  retryBtnText: {
    color: Theme.colors.white,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: Theme.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.white,
    borderTopLeftRadius: Theme.borderRadius.xl,
    borderTopRightRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: Theme.spacing.lg,
  },
  submitButton: {
    backgroundColor: Theme.colors.primary,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
  },
  submitButtonText: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  validationText: {
    fontSize: 12,
    marginBottom: Theme.spacing.lg,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    height: 46,
    ...Theme.shadow.light,
  },
  searchIcon: {
    marginRight: Theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Theme.colors.text,
    paddingVertical: 8,
  },
  clearSearchBtn: {
    padding: 4,
  },
  emptySubText: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
  },
});

export default ManagePersonsScreen;
