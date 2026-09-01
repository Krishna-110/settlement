import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import SummaryCard from '../components/SummaryCard';
import DonutChart from '../components/DonutChart';
import TransactionCard from '../components/TransactionCard';
import { Bell, HandCoins, LogOut } from 'lucide-react-native';
import PhoneOnboardingModal from '../components/PhoneOnboardingModal';
import { requestContactPermission } from '../services/ContactService';

const DashboardScreen = ({ navigation }) => {
  const { debts, notifications, fetchData, logout, isLoading, user, updateDebt, deleteDebt, acceptDebt, declineDebt, restoreDebt, markNotificationsRead } = useStore();

  const [selectedDebt, setSelectedDebt] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [actingOnId, setActingOnId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  const openNotifications = () => {
    setShowNotifications(true);
    if (unreadCount > 0) markNotificationsRead();
  };

  const handleAccept = async (debt) => {
    setActingOnId(debt.id);
    try {
      await acceptDebt(debt.id);
    } catch (e) {
      Alert.alert('Error', 'Could not accept this debt. Please try again.');
    } finally {
      setActingOnId(null);
    }
  };

  const handleDecline = (debt) => {
    Alert.alert(
      'Decline this debt?',
      `${debt.creditor?.name} says you owe ₹${debt.amount}. It will be marked Declined and kept in history; ${debt.creditor?.name} will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActingOnId(debt.id);
            try { await declineDebt(debt.id); } catch (e) {} finally { setActingOnId(null); }
          },
        },
      ]
    );
  };

  const handleRestore = async () => {
    if (!selectedDebt) return;
    setIsSubmitting(true);
    try {
      await restoreDebt(selectedDebt.id);
      setSelectedDebt(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to restore transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refetch whenever the tab regains focus so new proposals / acceptances show up
  // without needing a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    // Show phone onboarding if user is logged in but has no phone number
    if (user && !user.phoneNumber && !isLoading) {
      setShowPhoneModal(true);
    } else if (user && user.phoneNumber && !isLoading) {
      setShowPhoneModal(false);
      // Automatically ask for contact permission once phone is setup
      requestContactPermission();
    }
  }, [user, isLoading]);

  const onRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const openEditModal = (debt) => {
    // Settled / declined transactions are historical and can't be edited.
    // (Deleted rows still open the modal so they can be restored.)
    if (debt.status === 'SETTLED' || debt.status === 'DECLINED') {
      Alert.alert('Locked', `This transaction is ${debt.status.toLowerCase()} and can no longer be edited.`);
      return;
    }
    setSelectedDebt(debt);
    setEditAmount(debt.amount.toString());
    setEditNote(debt.note || '');
  };

  const handleUpdate = async () => {
    if (!selectedDebt || !editAmount || isNaN(parseFloat(editAmount))) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await updateDebt(selectedDebt.id, {
        debtorPhone: selectedDebt.debtor.phoneNumber,
        creditorPhone: selectedDebt.creditor.phoneNumber,
        amount: parseFloat(editAmount),
        note: editNote
      });
      setSelectedDebt(null);
      Alert.alert('Success', 'Transaction updated!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!selectedDebt) return;
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          setIsSubmitting(true);
          try {
            await deleteDebt(selectedDebt.id);
            setSelectedDebt(null);
          } catch(err) {} finally { setIsSubmitting(false); }
      }}
    ]);
  };

  // The user's OWN position, computed from the real debts (netted per person). This is
  // deliberately independent of the optimized Settlements tab: the dashboard shows what
  // YOU actually owe and are owed, even when the global optimizer routes around you.
  const myPhone = user?.phoneNumber;

  const balanceByPhone = {}; // phone -> { name, amount }  (amount > 0: they owe you; < 0: you owe them)
  debts
    .filter(d => d.status === 'PENDING'
      && (d.debtor?.phoneNumber === myPhone || d.creditor?.phoneNumber === myPhone))
    .forEach(d => {
      const youAreCreditor = d.creditor?.phoneNumber === myPhone;
      const other = youAreCreditor ? d.debtor : d.creditor;
      if (!other?.phoneNumber) return;
      if (!balanceByPhone[other.phoneNumber]) {
        balanceByPhone[other.phoneNumber] = { name: other.name, amount: 0 };
      }
      balanceByPhone[other.phoneNumber].amount += youAreCreditor ? d.amount : -d.amount;
    });

  const myBalances = Object.entries(balanceByPhone)
    .map(([phone, v]) => ({ phone, name: v.name, amount: v.amount }))
    .filter(b => Math.abs(b.amount) > 0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const totalGet = myBalances.filter(b => b.amount > 0).reduce((acc, b) => acc + b.amount, 0);
  const totalOwe = myBalances.filter(b => b.amount < 0).reduce((acc, b) => acc - b.amount, 0);
  const netBalance = totalGet - totalOwe;
  const userTotalDebts = totalOwe; // "Total Debts" = what YOU owe

  // Total Settled volume = sum of the user's SETTLED debts.
  const totalSettled = debts
    .filter(d =>
      (d.debtor?.phoneNumber === myPhone || d.creditor?.phoneNumber === myPhone) &&
      d.status === 'SETTLED'
    )
    .reduce((acc, d) => acc + d.amount, 0);

  // Debts the user must confirm (someone says you owe them), and ones they proposed
  // and are waiting on (you say someone owes you).
  const toConfirm = debts.filter(d => d.status === 'UNCONFIRMED' && d.debtor?.phoneNumber === myPhone);
  const waitingOnOthers = debts.filter(d => d.status === 'UNCONFIRMED' && d.creditor?.phoneNumber === myPhone);

  return (
    <SafeAreaView style={styles.container}>
      {/* AppBar: Title */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <HandCoins size={24} color={Theme.colors.primary} />
            <Text style={styles.headerTitle}>Settlement</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.iconButton, { marginRight: Theme.spacing.xs }]} 
              onPress={() => {
                logout();
              }}
            >
              <LogOut size={20} color={Theme.colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={openNotifications}>
              <Bell size={20} color={Theme.colors.text} />
              {unreadCount > 0 && (
                <View style={styles.notificationCountBadge}>
                  <Text style={styles.notificationCountText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Active Balances Section */}
        <View style={styles.greetSection}>
          <Text style={styles.greetText}>Welcome, {user?.name?.split(' ')[0] || 'User'}! 👋</Text>
          <Text style={styles.nameText}>Active Balances</Text>
        </View>

        {/* Hero Section - Donut Chart Kept as requested */}
        <View style={styles.heroSection}>
          <DonutChart owe={totalOwe} get={totalGet} net={netBalance} />
        </View>

        {/* Summary Cards Row - Aligned with Widget Tree Document */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryRow}>
            <SummaryCard title="Total Debts" amount={userTotalDebts} type="get" />
            <SummaryCard title="Total Settled" amount={totalSettled} type="neutral" />
          </View>
        </View>

        {/* Needs Your Confirmation - debts others recorded against you */}
        {toConfirm.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs Your Confirmation</Text>
            </View>
            <View style={styles.settlementList}>
              {toConfirm.map((d, index) => (
                <View key={index} style={styles.confirmItem}>
                  <TransactionCard
                    debtor={d.debtor?.name}
                    creditor={d.creditor?.name}
                    amount={d.amount}
                    status="UNCONFIRMED"
                    note={d.note}
                  />
                  <View style={styles.confirmActions}>
                    <TouchableOpacity
                      style={[styles.confirmBtn, styles.declineBtn]}
                      disabled={actingOnId === d.id}
                      onPress={() => handleDecline(d)}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmBtn, styles.acceptBtn]}
                      disabled={actingOnId === d.id}
                      onPress={() => handleAccept(d)}
                    >
                      {actingOnId === d.id ? (
                        <ActivityIndicator color={Theme.colors.white} size="small" />
                      ) : (
                        <Text style={styles.acceptText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Waiting on others to confirm debts you recorded */}
        {waitingOnOthers.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Waiting for Confirmation</Text>
            </View>
            <View style={styles.settlementList}>
              {waitingOnOthers.map((d, index) => (
                <View key={index} style={{ opacity: 0.7 }}>
                  <TransactionCard
                    debtor={d.debtor?.name}
                    creditor={d.creditor?.name}
                    amount={d.amount}
                    status="UNCONFIRMED"
                    note={`Waiting for ${d.debtor?.name} to accept`}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* Your Balances Section - who you owe and who owes you (netted per person) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Balances</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settlements')}>
            <Text style={styles.sectionAction}>Optimize</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.settlementList}>
          {myBalances.map((b, index) => {
            const theyOweYou = b.amount > 0;
            return (
              <TransactionCard
                key={index}
                debtor={theyOweYou ? b.name : 'You'}
                creditor={theyOweYou ? 'You' : b.name}
                amount={Math.abs(b.amount)}
                status="PENDING"
              />
            );
          })}

          {myBalances.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You're all squared up! 🎉</Text>
            </View>
          )}
        </View>

        {/* Transaction History Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Text style={styles.sectionAction}>View All</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.settlementList}>
          {debts
            .filter(d => (d.debtor?.phoneNumber === user?.phoneNumber || d.creditor?.phoneNumber === user?.phoneNumber)
              && d.status !== 'UNCONFIRMED') // unconfirmed shows in the confirmation sections, not the log
            .sort((a, b) => b.id - a.id) // Show newest first
            .slice(0, 5)
            .map((d, index) => (
            <TouchableOpacity key={index} onPress={() => openEditModal(d)}>
              <TransactionCard 
                debtor={d.debtor?.name}
                creditor={d.creditor?.name}
                amount={d.amount}
                status={d.status}
                note={d.note}
              />
            </TouchableOpacity>
          ))}

          {debts.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No transactions found.</Text>
            </View>
          )}
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Edit Debt Modal */}
      <Modal visible={!!selectedDebt} animationType="slide" transparent={true} onRequestClose={() => setSelectedDebt(null)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {selectedDebt?.status === 'DELETED' ? (
                <>
                  <Text style={styles.modalTitle}>Restore Transaction</Text>
                  <Text style={styles.modalSubtitle}>
                    This entry was deleted{selectedDebt?.deletedBy ? ` by ${selectedDebt.deletedBy}` : ''}. Restore it to bring the debt back and re-balance.
                  </Text>
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => setSelectedDebt(null)} disabled={isSubmitting}>
                      <Text style={styles.deleteBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleRestore} disabled={isSubmitting}>
                      {isSubmitting ? <ActivityIndicator color={Theme.colors.white} /> : <Text style={styles.saveBtnText}>Restore</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>Edit Transaction</Text>

                  {selectedDebt && (
                    <Text style={styles.modalSubtitle}>
                      {selectedDebt.creditor?.name} paid for {selectedDebt.debtor?.name}
                    </Text>
                  )}

                  <Text style={styles.label}>Amount</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.currencyPrefix}>₹</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={editAmount}
                      onChangeText={setEditAmount}
                      editable={!isSubmitting}
                    />
                  </View>

                  <Text style={styles.label}>Note</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      value={editNote}
                      onChangeText={setEditNote}
                      editable={!isSubmitting}
                      placeholder="Optional Note"
                    />
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete} disabled={isSubmitting}>
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleUpdate} disabled={isSubmitting}>
                      {isSubmitting ? <ActivityIndicator color={Theme.colors.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setSelectedDebt(null)}>
                    <Text style={styles.closeModalText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotifications} animationType="slide" transparent={true} onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Notifications</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {(notifications || []).length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No notifications yet.</Text>
                </View>
              ) : (
                notifications.map((n, index) => (
                  <View key={n.id || index} style={styles.notifItem}>
                    <Text style={styles.notifMessage}>{n.message}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowNotifications(false)}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <PhoneOnboardingModal 
        visible={showPhoneModal} 
        onComplete={() => {
          setShowPhoneModal(false);
          fetchData();
        }} 
      />
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border + '50',
  },
  notificationBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.danger,
    borderWidth: 2,
    borderColor: Theme.colors.white,
  },
  notificationCountBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.white,
  },
  notificationCountText: {
    color: Theme.colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  notifItem: {
    paddingVertical: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border + '60',
  },
  notifMessage: {
    fontSize: 14,
    color: Theme.colors.text,
    lineHeight: 20,
  },
  content: {
    paddingTop: Theme.spacing.lg,
  },
  greetSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  greetText: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nameText: {
    fontSize: 28,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: -1,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  summaryGrid: {
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: Theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  sectionAction: {
    fontSize: 14,
    color: Theme.colors.primary,
    fontWeight: '600',
  },
  settlementList: {
    paddingHorizontal: Theme.spacing.xs,
  },
  confirmItem: {
    marginBottom: Theme.spacing.sm,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Theme.spacing.md,
    marginTop: -Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: Theme.borderRadius.full || 20,
    marginLeft: Theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  acceptBtn: {
    backgroundColor: Theme.colors.secondary || Theme.colors.primary,
  },
  declineBtn: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.danger,
  },
  acceptText: {
    color: Theme.colors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  declineText: {
    color: Theme.colors.danger,
    fontWeight: '800',
    fontSize: 14,
  },
  emptyContainer: {
    padding: Theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  squaredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.success + '15',
    marginHorizontal: Theme.spacing.lg,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: Theme.colors.success + '30',
  },
  squaredIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  squaredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  squaredSubtitle: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
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
    padding: Theme.spacing.xl,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
    marginTop: Theme.spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.colors.text,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Theme.spacing.xl,
  },
  actionBtn: {
    flex: 1,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: Theme.colors.surface,
    marginRight: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Theme.colors.danger,
  },
  deleteBtnText: {
    color: Theme.colors.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    marginLeft: Theme.spacing.sm,
  },
  saveBtnText: {
    color: Theme.colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  closeModalBtn: {
    marginTop: Theme.spacing.lg,
    alignItems: 'center',
  },
  closeModalText: {
    color: Theme.colors.textSecondary,
    fontWeight: '600',
  },
});

export default DashboardScreen;
