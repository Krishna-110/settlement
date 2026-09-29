import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import { ChevronLeft, ListFilter } from 'lucide-react-native';
import TransactionCard from '../components/TransactionCard';

const HistoryScreen = ({ navigation }) => {
  const { debts, user, restoreDebt, updateDebt, deleteDebt } = useStore();
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeDebts = Array.isArray(debts) ? debts : [];
  const userDebts = safeDebts
    .filter(d => d && (d.debtor?.phoneNumber === user?.phoneNumber || d.creditor?.phoneNumber === user?.phoneNumber)
      && d.status !== 'UNCONFIRMED') // unconfirmed proposals aren't real transactions yet
    .sort((a, b) => b.id - a.id);

  const normalizePhone = (p) => (p || '').replace(/\D/g, '');
  const isMe = (person) => {
    if (!person || !user) return false;
    if (person.id && user.id && String(person.id) === String(user.id)) return true;
    if (person.phoneNumber && user.phoneNumber) {
      const p1 = normalizePhone(person.phoneNumber);
      const p2 = normalizePhone(user.phoneNumber);
      if (p1 && p2 && (p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1))) return true;
    }
    if (person.email && user.email && person.email.toLowerCase() === user.email.toLowerCase()) return true;
    if (person.name && user.name && person.name.trim().toLowerCase() === user.name.trim().toLowerCase()) return true;
    return false;
  };

  const getDisplayName = (person) => {
    if (isMe(person)) return 'You';
    return person?.name || 'Unknown';
  };

  const openEditModal = (debt) => {
    if (debt.status === 'SETTLED' || debt.status === 'DECLINED') {
      Alert.alert('Locked', `This transaction is ${debt.status.toLowerCase()} and can no longer be edited.`);
      return;
    }
    setSelectedDebt(debt);
    setEditAmount(debt.amount ? debt.amount.toString() : '');
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
        debtorPhone: selectedDebt.debtor?.phoneNumber,
        creditorPhone: selectedDebt.creditor?.phoneNumber,
        debtorId: selectedDebt.debtor?.id,
        creditorId: selectedDebt.creditor?.id,
        amount: parseFloat(editAmount),
        note: editNote
      });
      setSelectedDebt(null);
      Alert.alert('Success', 'Transaction updated!');
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to update transaction.';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!selectedDebt) return;
    const isUnconfirmed = selectedDebt.status === 'UNCONFIRMED';
    Alert.alert(
      isUnconfirmed ? 'Cancel Request' : 'Confirm Delete',
      isUnconfirmed
        ? 'Are you sure you want to cancel this pending request?'
        : 'Are you sure you want to delete this transaction?',
      [
        { text: 'Keep', style: 'cancel' },
        { 
          text: isUnconfirmed ? 'Cancel Request' : 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await deleteDebt(selectedDebt.id);
              setSelectedDebt(null);
            } catch(err) {
              const msg = err.response?.data?.message || err.message || 'Failed to delete transaction.';
              Alert.alert('Error', msg);
            } finally { 
              setIsSubmitting(false); 
            }
          }
        }
      ]
    );
  };

  const handleRestore = async () => {
    if (!selectedDebt) return;
    setIsSubmitting(true);
    try {
      await restoreDebt(selectedDebt.id);
      setSelectedDebt(null);
    } catch(err) {
      const msg = err.response?.data?.message || err.message || 'Failed to restore transaction.';
      Alert.alert('Error', msg);
    } finally { 
      setIsSubmitting(false); 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={Theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Transaction History</Text>
          <Text style={styles.subtitle}>{userDebts.length} Transactions Found</Text>
        </View>
        <TouchableOpacity style={styles.filterButton}>
          <ListFilter size={20} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={userDebts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openEditModal(item)} activeOpacity={0.7}>
            <TransactionCard
              debtor={getDisplayName(item.debtor)}
              creditor={getDisplayName(item.creditor)}
              amount={item.amount}
              status={item.status}
              note={item.status === 'DELETED' ? (item.deletedBy ? `Deleted · tap to restore` : 'Tap to restore') : item.note}
            />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No history available yet.</Text>
          </View>
        }
      />

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
                  <Text style={styles.modalTitle}>
                    {selectedDebt?.status === 'UNCONFIRMED' ? 'Edit Request' : 'Edit Transaction'}
                  </Text>

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
                      <Text style={styles.deleteBtnText}>
                        {selectedDebt?.status === 'UNCONFIRMED' ? 'Cancel Request' : 'Delete'}
                      </Text>
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
    padding: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border + '50',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: Theme.spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
  },
  filterButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingVertical: Theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
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

export default HistoryScreen;
