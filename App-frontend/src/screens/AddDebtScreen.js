import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Modal, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import { Save, UserCircle, ChevronDown, Paperclip, UserPlus } from 'lucide-react-native';
import { TRANSACTION_TAGS, formatNoteWithTag } from '../utils/transactionTags';
import { FEATURES } from '../config/features';

const AddDebtScreen = ({ navigation }) => {
  const { persons, groups, addDebt, fetchData, user } = useStore();
  const [iPaid, setIPaid] = useState(true); // true = "I paid" (you're the creditor); false = "I owe"
  const [otherPerson, setOtherPerson] = useState(null);
  const [amount, setAmount] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [comment, setComment] = useState('');
  const [groupId, setGroupId] = useState(null);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One side of the transaction is ALWAYS you; the other is a friend. No friend<->friend entries.
  const creditor = iPaid ? user : otherPerson; // who paid
  const debtor = iPaid ? otherPerson : user;   // who owes

  const submitDebt = async () => {
    setIsSubmitting(true);
    try {
      const finalNote = formatNoteWithTag(selectedTag, comment);
      await addDebt({
        debtorPhone: debtor.phoneNumber,
        creditorPhone: creditor.phoneNumber,
        debtorId: debtor.id,
        creditorId: creditor.id,
        amount: parseFloat(amount),
        note: finalNote,
        groupId: groupId,
      });
      fetchData();
      const friendName = otherPerson?.name || 'them';
      setAmount('');
      setSelectedTag(null);
      setComment('');
      setOtherPerson(null);
      Alert.alert(
        'Success',
        iPaid
          ? `Sent to ${friendName} for confirmation. It becomes active once they accept.`
          : 'Transaction recorded.'
      );
      navigation.navigate('Dashboard');
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to save transaction. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = () => {
    if (!user) {
      Alert.alert('Not Ready', 'Your profile is still loading. Please try again in a moment.');
      return;
    }
    if (!otherPerson || !amount) {
      Alert.alert('Missing Fields', 'Please choose a friend and enter an amount.');
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
      return;
    }
    submitDebt();
  };

  const openPersonPicker = () => {
    if (persons.length === 0) {
      Alert.alert('No Friends Found', 'Please add some friends in the "Persons" tab before recording a transaction.');
      return;
    }
    setShowPersonModal(true);
  };

  const selectPerson = (person) => {
    setOtherPerson(person);
    setShowPersonModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Record Transaction</Text>
          <Text style={styles.subtitle}>Log money you paid for a friend, or money you owe one.</Text>
        </View>

        {/* Form Group */}
        <View style={styles.form}>

          {/* Direction toggle - one side is always you */}
          <Text style={styles.label}>This transaction is...</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, iPaid && styles.toggleBtnActive]}
              onPress={() => setIPaid(true)}
              disabled={isSubmitting}
            >
              <Text style={[styles.toggleText, iPaid && styles.toggleTextActive]}>I paid</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, !iPaid && styles.toggleBtnActive]}
              onPress={() => setIPaid(false)}
              disabled={isSubmitting}
            >
              <Text style={[styles.toggleText, !iPaid && styles.toggleTextActive]}>I owe</Text>
            </TouchableOpacity>
          </View>

          {/* The other person (always a friend) */}
          <Text style={styles.label}>{iPaid ? 'Who owes you?' : 'Who did you pay?'}</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={openPersonPicker}
            disabled={isSubmitting}
          >
            <UserCircle size={20} color={otherPerson ? Theme.colors.primary : Theme.colors.textSecondary} />
            <Text style={[styles.pickerText, !otherPerson && styles.placeholder]}>
              {otherPerson ? otherPerson.name : 'Select a friend'}
            </Text>
            <ChevronDown size={16} color={Theme.colors.textSecondary} />
          </TouchableOpacity>

          {/* Plain-language summary so the direction is unmistakable */}
          {otherPerson && (
            <Text style={styles.summaryLine}>
              {iPaid
                ? `${otherPerson.name} will owe you${amount ? ' ₹' + amount : ''}.`
                : `You will owe ${otherPerson.name}${amount ? ' ₹' + amount : ''}.`}
            </Text>
          )}

          {/* Amount */}
          <Text style={styles.label}>Amount</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={!isSubmitting}
            />
          </View>

          {/* Category Tag (Optional) */}
          <Text style={styles.label}>Category Tag (Optional)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagScroll}
          >
            {TRANSACTION_TAGS.map((t) => {
              const isSelected = selectedTag === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tagChip, isSelected && styles.tagChipActive]}
                  onPress={() => setSelectedTag(isSelected ? null : t.id)}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.tagIcon}>{t.icon}</Text>
                  <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Comment / Note (Optional) */}
          <Text style={styles.label}>Comment / Note (Optional)</Text>
          <View style={styles.inputContainer}>
            <Paperclip size={18} color={Theme.colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder={selectedTag ? `Add details for ${selectedTag}...` : "e.g. Dinner, Rent, Movies"}
              value={comment}
              onChangeText={setComment}
              editable={!isSubmitting}
            />
          </View>

          {FEATURES.ENABLE_GROUPS && groups.length > 0 && (
            <>
              <Text style={styles.label}>Group (optional)</Text>
              <View style={styles.groupChips}>
                <TouchableOpacity
                  style={[styles.groupChip, !groupId && styles.groupChipActive]}
                  onPress={() => setGroupId(null)}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.groupChipText, !groupId && styles.groupChipTextActive]}>None</Text>
                </TouchableOpacity>
                {groups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupChip, groupId === g.id && styles.groupChipActive]}
                    onPress={() => setGroupId(g.id)}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.groupChipText, groupId === g.id && styles.groupChipTextActive]} numberOfLines={1}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, Theme.shadow.medium, isSubmitting && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <>
              <Save size={20} color={Theme.colors.white} />
              <Text style={styles.saveButtonText}>Save Transaction</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Friend Picker Modal - friends only, never yourself */}
      <Modal visible={showPersonModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select a Friend</Text>
            <FlatList
              data={persons}
              keyExtractor={(item) => item.phoneNumber || item.email}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.personItem}
                  onPress={() => selectPerson(item)}
                >
                  <Text style={styles.personName}>{item.name}</Text>
                  <Text style={styles.personEmail}>{item.phoneNumber}</Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
            {persons.length === 0 && (
              <View style={styles.emptyModalContainer}>
                <View style={styles.emptyIconWrapper}>
                  <UserPlus size={24} color={Theme.colors.primary} />
                </View>
                <Text style={styles.emptyModalTitle}>No Friends Added</Text>
                <Text style={styles.emptyModalText}>
                  To split debts, you need to add your friends or sync your phone contacts first.
                </Text>
                <TouchableOpacity
                  style={[styles.modalAddButton, Theme.shadow.light]}
                  onPress={() => {
                    setShowPersonModal(false);
                    navigation.navigate('Persons');
                  }}
                >
                  <UserPlus size={18} color={Theme.colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.modalAddButtonText}>Add Friends / Sync Contacts</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowPersonModal(false)}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
  },
  header: {
    marginBottom: Theme.spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  form: {
    marginBottom: Theme.spacing.xl,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
    marginTop: Theme.spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: Theme.spacing.sm,
    alignItems: 'center',
    borderRadius: Theme.borderRadius.md,
  },
  toggleBtnActive: {
    backgroundColor: Theme.colors.primary,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
  },
  toggleTextActive: {
    color: Theme.colors.white,
  },
  summaryLine: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Theme.spacing.xs,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  pickerText: {
    flex: 1,
    marginLeft: Theme.spacing.sm,
    fontSize: 16,
    color: Theme.colors.text,
  },
  placeholder: {
    color: Theme.colors.textSecondary,
  },
  tagScroll: {
    flexDirection: 'row',
    paddingVertical: Theme.spacing.xs,
    marginBottom: Theme.spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginRight: 8,
  },
  tagChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  tagIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  tagTextActive: {
    color: Theme.colors.white,
  },
  groupChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Theme.spacing.xs,
  },
  groupChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  groupChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  groupChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
    maxWidth: 140,
  },
  groupChipTextActive: {
    color: Theme.colors.white,
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
  saveButton: {
    backgroundColor: Theme.colors.text,
    flexDirection: 'row',
    height: 56,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: Theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: Theme.spacing.xl,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: Theme.spacing.lg,
    textAlign: 'center',
  },
  personItem: {
    paddingVertical: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border + '50',
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  personEmail: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
  },
  closeButton: {
    marginTop: Theme.spacing.lg,
    padding: Theme.spacing.md,
    alignItems: 'center',
  },
  closeButtonText: {
    color: Theme.colors.danger,
    fontWeight: '700',
  },
  emptyModalContainer: {
    backgroundColor: Theme.colors.primary + '08', // light indigo tinted surface
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    alignItems: 'center',
    marginVertical: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '15',
  },
  emptyIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.xs,
  },
  emptyModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  emptyModalText: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
  },
  modalAddButton: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.full,
    width: '100%',
  },
  modalAddButtonText: {
    color: Theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default AddDebtScreen;
