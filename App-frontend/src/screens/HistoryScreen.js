import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import { ChevronLeft, ListFilter } from 'lucide-react-native';
import TransactionCard from '../components/TransactionCard';

const HistoryScreen = ({ navigation }) => {
  const { debts, user, restoreDebt } = useStore();

  const safeDebts = Array.isArray(debts) ? debts : [];
  const userDebts = safeDebts
    .filter(d => d && (d.debtor?.phoneNumber === user?.phoneNumber || d.creditor?.phoneNumber === user?.phoneNumber)
      && d.status !== 'UNCONFIRMED') // unconfirmed proposals aren't real transactions yet
    .sort((a, b) => b.id - a.id);

  const confirmRestore = (debt) => {
    Alert.alert(
      'Restore this transaction?',
      `This will bring back "${debt.debtor?.name} owes ${debt.creditor?.name} ₹${debt.amount}" and re-balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => { restoreDebt(debt.id).catch(() => {}); } },
      ]
    );
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
          item.status === 'DELETED' ? (
            <TouchableOpacity onPress={() => confirmRestore(item)} activeOpacity={0.7}>
              <TransactionCard
                debtor={item.debtor?.name}
                creditor={item.creditor?.name}
                amount={item.amount}
                status={item.status}
                note={item.deletedBy ? `Deleted · tap to restore` : 'Tap to restore'}
              />
            </TouchableOpacity>
          ) : (
            <TransactionCard
              debtor={item.debtor?.name}
              creditor={item.creditor?.name}
              amount={item.amount}
              status={item.status}
            />
          )
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No history available yet.</Text>
          </View>
        }
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
});

export default HistoryScreen;
