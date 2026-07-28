import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, TextInput,
  Alert, Image, ActivityIndicator, Share, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import {
  LogOut, Pencil, QrCode, Share2, Trophy, Flame, Lock, Plus, LogIn, Users, ChevronRight,
} from 'lucide-react-native';

import { APP_WEBSITE, joinGroupLink, qrImageUrl } from '../config/links';

const inviteLinkFor = (group) => joinGroupLink(group.joinCode);
const qrUrl = qrImageUrl;

// The code is spelled out as the primary instruction: a custom-scheme link isn't always
// tappable in every messaging app, so the code must always work on its own.
const inviteMessageFor = (group) =>
  `Join my group "${group.name}" on Settlement!\n\n` +
  `Group code: ${group.joinCode}\n\n` +
  `Tap to join: ${inviteLinkFor(group)}\n\n` +
  `Don't have the app yet? ${APP_WEBSITE}`;

const AccountScreen = () => {
  const {
    user, groups, gamification, logout, updateMyProfile,
    createGroup, joinGroup, leaveGroup, fetchData, isLoading,
  } = useStore();

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [groupModal, setGroupModal] = useState(null); // 'create' | 'join' | null
  const [groupInput, setGroupInput] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0] || null;
  const initial = (user?.name || '?').charAt(0).toUpperCase();

  // ---- Profile ----
  const openEdit = () => {
    setEditName(user?.name || '');
    setEditPhone(user?.phoneNumber || '');
    setEditVisible(true);
  };
  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateMyProfile({ name: editName, phone: editPhone || undefined });
      setEditVisible(false);
    } catch (e) {
      Alert.alert('Could not save', e.response?.data?.message || 'Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const setPref = async (patch) => {
    try {
      await updateMyProfile(patch);
    } catch (e) {
      Alert.alert('Could not update', e.response?.data?.message || 'Please try again.');
    }
  };

  // ---- Groups ----
  const submitGroup = async () => {
    const value = groupInput.trim();
    if (!value) return;
    setGroupBusy(true);
    try {
      if (groupModal === 'create') {
        const g = await createGroup(value);
        setSelectedGroupId(g.id);
      } else {
        const g = await joinGroup(value);
        setSelectedGroupId(g.id);
      }
      setGroupInput('');
      setGroupModal(null);
    } catch (e) {
      Alert.alert(groupModal === 'create' ? 'Create failed' : 'Join failed',
        e.response?.data?.message || 'Please try again.');
    } finally {
      setGroupBusy(false);
    }
  };

  const inviteWhatsApp = (group) => {
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(inviteMessageFor(group))}`).catch(() =>
      Alert.alert('WhatsApp not available', 'Could not open WhatsApp on this device.'));
  };
  const shareCode = (group) => {
    Share.share({ message: inviteMessageFor(group) });
  };
  const confirmLeave = (group) => {
    Alert.alert('Leave group?', `Leave "${group.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveGroup(group.id).catch(() => {}) },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const progress = gamification?.progressPercent ?? 0;
  const streak = gamification?.streakWeeks ?? 0;
  const badges = gamification?.badges ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchData} tintColor={Theme.colors.primary} />}
      >
        <Text style={styles.screenTitle}>Account</Text>

        {/* ---------- Profile ---------- */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            {user?.pictureUrl ? (
              <Image source={{ uri: user.pictureUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: Theme.spacing.md }}>
              <Text style={styles.name} numberOfLines={1}>{user?.name || 'You'}</Text>
              {!!user?.email && <Text style={styles.sub} numberOfLines={1}>{user.email}</Text>}
              <Text style={styles.sub}>{user?.phoneNumber || 'No phone added'}</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={openEdit}>
              <Pencil size={18} color={Theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ---------- Invite / Groups ---------- */}
        <Text style={styles.sectionTitle}>Groups & Invite</Text>
        <View style={styles.card}>
          <View style={styles.chipRow}>
            {groups.map((g) => {
              const active = selectedGroup && g.id === selectedGroup.id;
              return (
                <TouchableOpacity key={g.id} style={[styles.chip, active && styles.chipActive]} onPress={() => setSelectedGroupId(g.id)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.chip, styles.chipGhost]} onPress={() => { setGroupInput(''); setGroupModal('create'); }}>
              <Plus size={14} color={Theme.colors.primary} />
              <Text style={[styles.chipText, { color: Theme.colors.primary, marginLeft: 4 }]}>New</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, styles.chipGhost]} onPress={() => { setGroupInput(''); setGroupModal('join'); }}>
              <LogIn size={14} color={Theme.colors.primary} />
              <Text style={[styles.chipText, { color: Theme.colors.primary, marginLeft: 4 }]}>Join</Text>
            </TouchableOpacity>
          </View>

          {selectedGroup ? (
            <View style={styles.groupBody}>
              <Text style={styles.groupName}>{selectedGroup.name}</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Group code</Text>
                <Text style={styles.codeValue}>{selectedGroup.joinCode}</Text>
              </View>
              <Image source={{ uri: qrUrl(inviteLinkFor(selectedGroup)) }} style={styles.qr} resizeMode="contain" />

              <TouchableOpacity style={styles.waButton} onPress={() => inviteWhatsApp(selectedGroup)}>
                <Share2 size={18} color={Theme.colors.white} />
                <Text style={styles.waText}>Invite via WhatsApp</Text>
              </TouchableOpacity>
              <View style={styles.groupActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => shareCode(selectedGroup)}>
                  <QrCode size={16} color={Theme.colors.text} />
                  <Text style={styles.secondaryText}>Share code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => confirmLeave(selectedGroup)}>
                  <Text style={[styles.secondaryText, { color: Theme.colors.danger }]}>Leave</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Users size={28} color={Theme.colors.textSecondary} />
              <Text style={styles.emptyText}>No groups yet. Create one to invite friends, or join with a code.</Text>
            </View>
          )}
        </View>

        {/* ---------- Gamification ---------- */}
        <Text style={styles.sectionTitle}>Your Progress</Text>
        <View style={styles.card}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{progress}%</Text>
              <Text style={styles.statLabel}>Debts cleared</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.streakRow}>
                <Flame size={18} color={Theme.colors.accent} />
                <Text style={styles.statValue}>{streak}</Text>
              </View>
              <Text style={styles.statLabel}>Week streak</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
          </View>

          <View style={styles.badgeGrid}>
            {badges.map((b) => (
              <View key={b.key} style={[styles.badge, b.unlocked ? styles.badgeUnlocked : styles.badgeLocked]}>
                {b.unlocked ? <Trophy size={20} color={Theme.colors.secondary} /> : <Lock size={20} color={Theme.colors.textSecondary} />}
                <Text style={[styles.badgeName, !b.unlocked && { color: Theme.colors.textSecondary }]} numberOfLines={1}>{b.name}</Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>{b.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ---------- Settings ---------- */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Hide my phone from others</Text>
            <Switch
              value={!!user?.hidePhone}
              onValueChange={(v) => setPref({ hidePhone: v })}
              trackColor={{ true: Theme.colors.primary }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Hide my email from others</Text>
            <Switch
              value={!!user?.hideEmail}
              onValueChange={(v) => setPref({ hideEmail: v })}
              trackColor={{ true: Theme.colors.primary }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch
              value={user?.notificationsEnabled !== false}
              onValueChange={(v) => setPref({ notificationsEnabled: v })}
              trackColor={{ true: Theme.colors.primary }}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={18} color={Theme.colors.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit profile modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Your name" />
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} placeholder="10-digit phone" keyboardType="numeric" />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator color={Theme.colors.white} /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create / Join group modal */}
      <Modal visible={!!groupModal} transparent animationType="slide" onRequestClose={() => setGroupModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{groupModal === 'create' ? 'Create a Group' : 'Join a Group'}</Text>
            <Text style={styles.inputLabel}>{groupModal === 'create' ? 'Group name' : 'Join code'}</Text>
            <TextInput
              style={styles.input}
              value={groupInput}
              onChangeText={setGroupInput}
              placeholder={groupModal === 'create' ? 'e.g. Goa Trip' : 'e.g. AB2C34'}
              autoCapitalize={groupModal === 'create' ? 'words' : 'characters'}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={submitGroup} disabled={groupBusy}>
              {groupBusy ? <ActivityIndicator color={Theme.colors.white} /> : <Text style={styles.saveText}>{groupModal === 'create' ? 'Create' : 'Join'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setGroupModal(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  content: { padding: Theme.spacing.lg },
  screenTitle: { fontSize: 28, fontWeight: '900', color: Theme.colors.text, letterSpacing: -1, marginBottom: Theme.spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Theme.colors.text, marginTop: Theme.spacing.lg, marginBottom: Theme.spacing.sm },
  card: {
    backgroundColor: Theme.colors.white, borderRadius: Theme.borderRadius.xl, padding: Theme.spacing.lg,
    borderWidth: 1, borderColor: Theme.colors.border + '40', ...Theme.shadow.light,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { backgroundColor: Theme.colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: Theme.colors.primary },
  name: { fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  sub: { fontSize: 13, color: Theme.colors.textSecondary, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: Theme.borderRadius.full, backgroundColor: Theme.colors.surface, borderWidth: 1, borderColor: Theme.colors.border,
  },
  chipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  chipGhost: { backgroundColor: Theme.colors.primary + '10', borderColor: Theme.colors.primary + '30' },
  chipText: { fontSize: 13, fontWeight: '700', color: Theme.colors.text, maxWidth: 140 },
  chipTextActive: { color: Theme.colors.white },
  groupBody: { alignItems: 'center', marginTop: Theme.spacing.md },
  groupName: { fontSize: 18, fontWeight: '800', color: Theme.colors.text, marginBottom: Theme.spacing.sm },
  codeBox: {
    alignItems: 'center', backgroundColor: Theme.colors.surface, borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.sm, paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
    borderWidth: 1, borderColor: Theme.colors.border,
  },
  codeLabel: { fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 24, fontWeight: '900', color: Theme.colors.text, letterSpacing: 4, marginTop: 2 },
  qr: { width: 180, height: 180, marginBottom: Theme.spacing.md },
  waButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: Theme.borderRadius.lg, paddingVertical: 14, width: '100%',
  },
  waText: { color: Theme.colors.white, fontWeight: '800', fontSize: 15 },
  groupActions: { flexDirection: 'row', gap: 10, marginTop: Theme.spacing.sm, width: '100%' },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Theme.borderRadius.lg, borderWidth: 1, borderColor: Theme.colors.border,
  },
  secondaryText: { fontWeight: '700', color: Theme.colors.text, fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: Theme.spacing.lg, gap: 8 },
  emptyText: { color: Theme.colors.textSecondary, textAlign: 'center', fontSize: 13, paddingHorizontal: Theme.spacing.md },

  statRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Theme.spacing.md },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '900', color: Theme.colors.text },
  statLabel: { fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressTrack: { height: 12, borderRadius: 6, backgroundColor: Theme.colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border },
  progressFill: { height: '100%', backgroundColor: Theme.colors.secondary, borderRadius: 6 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: Theme.spacing.md },
  badge: {
    width: '31%', borderRadius: Theme.borderRadius.lg, padding: Theme.spacing.sm, alignItems: 'center',
    borderWidth: 1, minHeight: 96, justifyContent: 'center',
  },
  badgeUnlocked: { backgroundColor: Theme.colors.secondary + '12', borderColor: Theme.colors.secondary + '40' },
  badgeLocked: { backgroundColor: Theme.colors.surface, borderColor: Theme.colors.border },
  badgeName: { fontSize: 12, fontWeight: '800', color: Theme.colors.text, marginTop: 6, textAlign: 'center' },
  badgeDesc: { fontSize: 10, color: Theme.colors.textSecondary, textAlign: 'center', marginTop: 2 },

  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Theme.spacing.sm },
  settingLabel: { fontSize: 15, color: Theme.colors.text, fontWeight: '600', flex: 1 },
  divider: { height: 1, backgroundColor: Theme.colors.border + '60' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Theme.spacing.lg,
    paddingVertical: 14, borderRadius: Theme.borderRadius.lg, borderWidth: 1, borderColor: Theme.colors.danger + '50',
    backgroundColor: Theme.colors.danger + '08',
  },
  logoutText: { color: Theme.colors.danger, fontWeight: '800', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: Theme.spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Theme.colors.text, textAlign: 'center', marginBottom: Theme.spacing.lg },
  inputLabel: { fontSize: 13, fontWeight: '700', color: Theme.colors.text, marginBottom: 6, marginTop: Theme.spacing.sm },
  input: {
    backgroundColor: Theme.colors.surface, borderRadius: Theme.borderRadius.lg, borderWidth: 1, borderColor: Theme.colors.border,
    padding: Theme.spacing.md, fontSize: 16, color: Theme.colors.text,
  },
  saveBtn: { backgroundColor: Theme.colors.primary, borderRadius: Theme.borderRadius.lg, alignItems: 'center', paddingVertical: 14, marginTop: Theme.spacing.lg },
  saveText: { color: Theme.colors.white, fontWeight: '800', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: Theme.spacing.md, marginTop: 4 },
  cancelText: { color: Theme.colors.textSecondary, fontWeight: '700' },
});

export default AccountScreen;
