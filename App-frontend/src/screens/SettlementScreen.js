import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { Theme } from '../theme/Theme';
import { HandCoins, Sparkles, CheckCircle2 } from 'lucide-react-native';
import TransactionCard from '../components/TransactionCard';

const SettlementScreen = () => {
  const { settlements, debts, fetchData, isLoading, user } = useStore();

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const safeSettlements = Array.isArray(settlements) ? settlements : [];
  const safeDebts = Array.isArray(debts) ? debts : [];

  const displayedSettlements = safeSettlements.filter(
    s => s && (s.fromPhone === user?.phoneNumber || s.toPhone === user?.phoneNumber)
  );

  // Does the user still have open debts even though the optimizer has nothing for them?
  // That happens when they're a "middleman" who nets to zero - the optimizer routes
  // around them, so they have nothing to do but their debts aren't gone yet.
  const hasPendingDebts = safeDebts.some(
    d => d && d.status === 'PENDING'
      && (d.debtor?.phoneNumber === user?.phoneNumber || d.creditor?.phoneNumber === user?.phoneNumber)
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <HandCoins size={28} color={Theme.colors.primary} />
          <Text style={styles.headerTitle}>Optimized Settlements</Text>
        </View>
        <Text style={styles.subtitle}>
          Proposed transactions to square all pending accounts globally.
        </Text>
      </View>



      <FlatList
        data={displayedSettlements}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.settlementItem}>
            <TransactionCard
              debtor={item?.from || 'Unknown'}
              creditor={item?.to || 'Unknown'}
              amount={item?.amount || 0}
            />
            <View style={styles.actionPrompt}>
              <Sparkles size={12} color={Theme.colors.secondary} />
              <Text style={styles.promptText}>
                {item?.from} needs to pay {item?.to} ₹{item?.amount}
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={fetchData} tintColor={Theme.colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.successIconOuter}>
               <CheckCircle2 size={60} color={Theme.colors.secondary} />
            </View>
            {hasPendingDebts ? (
              <>
                <Text style={styles.emptyText}>You're balanced 🎉</Text>
                <Text style={styles.emptySubtext}>
                  You owe and are owed the same amount, so there's nothing for you to pay.
                  Your open debts will clear automatically once the others settle up. See them on the Dashboard.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>All debts are optimized and settled!</Text>
                <Text style={styles.emptySubtext}>Your accounts are currently squared up. To settle a due, record the repayment in the Record tab.</Text>
              </>
            )}
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
    padding: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Theme.colors.text,
    marginLeft: Theme.spacing.sm,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
  },
  successIconOuter: {
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.colors.secondary + '15',
    padding: Theme.spacing.lg,
    borderRadius: 50,
  },
  list: {
    paddingBottom: Theme.spacing.xl,
  },
  settlementItem: {
    marginBottom: Theme.spacing.md,
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
    marginTop: -Theme.spacing.xs,
  },
  promptText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginLeft: 6,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: Theme.spacing.xl,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
  },
});

export default SettlementScreen;
