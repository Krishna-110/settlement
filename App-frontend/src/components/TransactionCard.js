import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../theme/Theme';
import { MoveRight } from 'lucide-react-native';

const TransactionCard = ({ debtor, creditor, amount, status, note }) => {
  const debtorName = debtor || 'Unknown';
  const creditorName = creditor || 'Unknown';
  const amountValue = amount || 0;
  const isSettled = status === 'SETTLED';
  const isUnconfirmed = status === 'UNCONFIRMED';
  const isDeclined = status === 'DECLINED';
  const isDeleted = status === 'DELETED';
  const isMuted = isSettled || isDeclined || isDeleted; // inactive -> greyed / struck-through

  return (
    <View style={[styles.card, Theme.shadow.light, isMuted && styles.settledCard]}>
      <View style={styles.row}>
      <View style={styles.personBlock}>
        <View style={[styles.avatar, isMuted && styles.settledAvatar]}>
          <Text style={[styles.avatarText, isMuted && styles.settledText]}>{debtorName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.details}>
          <Text style={[styles.name, isMuted && styles.settledText]} numberOfLines={1}>{debtorName}</Text>
          <Text style={styles.label}>{isMuted ? 'Owed' : 'Owes'}</Text>
        </View>
      </View>

      <View style={styles.connector}>
        <Text style={[styles.amount, isMuted && styles.settledText]}>₹{amountValue}</Text>
        {isSettled ? (
          <View style={styles.settledBadge}>
            <Text style={styles.settledBadgeText}>SETTLED</Text>
          </View>
        ) : isDeclined ? (
          <View style={styles.declinedBadge}>
            <Text style={styles.declinedBadgeText}>DECLINED</Text>
          </View>
        ) : isDeleted ? (
          <View style={styles.deletedBadge}>
            <Text style={styles.deletedBadgeText}>DELETED</Text>
          </View>
        ) : isUnconfirmed ? (
          <View style={styles.awaitingBadge}>
            <Text style={styles.awaitingBadgeText}>AWAITING</Text>
          </View>
        ) : (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>PENDING</Text>
          </View>
        )}
      </View>

      <View style={[styles.personBlock, { alignItems: 'flex-end' }]}>
        <View style={[styles.avatar, { backgroundColor: Theme.colors.secondary + '15' }, isMuted && styles.settledAvatar]}>
          <Text style={[styles.avatarText, { color: Theme.colors.secondary }, isMuted && styles.settledText]}>{creditorName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={[styles.details, { alignItems: 'flex-end' }]}>
          <Text style={[styles.name, isMuted && styles.settledText]} numberOfLines={1}>{creditorName}</Text>
          <Text style={styles.label}>{isMuted ? 'Recvd' : 'Gets'}</Text>
        </View>
      </View>
      </View>

      {/* Flows inside the card. It used to be absolutely positioned with bottom:-8, which made
          long notes hang outside the card and overlap the section heading below it. */}
      {note ? (
        <Text style={styles.noteText} numberOfLines={2}>{note}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.xl,
    marginBottom: Theme.spacing.sm,
    marginHorizontal: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border + '30',
  },
  // The debtor / amount / creditor line. Kept as its own row so the optional note can sit
  // beneath it inside the card.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  label: {
    fontSize: 10,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  connector: {
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.sm,
    minWidth: 80,
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  settledCard: {
    backgroundColor: Theme.colors.background,
    borderColor: Theme.colors.border,
    opacity: 0.8,
  },
  settledAvatar: {
    backgroundColor: Theme.colors.border,
  },
  settledText: {
    color: Theme.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  settledBadge: {
    backgroundColor: Theme.colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  settledBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.colors.textSecondary,
  },
  pendingBadge: {
    backgroundColor: Theme.colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
    borderWidth: 0.5,
    borderColor: Theme.colors.primary + '40',
  },
  pendingBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.colors.primary,
  },
  awaitingBadge: {
    backgroundColor: Theme.colors.accent + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
    borderWidth: 0.5,
    borderColor: Theme.colors.accent + '60',
  },
  awaitingBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.colors.accent,
  },
  declinedBadge: {
    backgroundColor: Theme.colors.danger + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
    borderWidth: 0.5,
    borderColor: Theme.colors.danger + '50',
  },
  declinedBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.colors.danger,
  },
  deletedBadge: {
    backgroundColor: Theme.colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  deletedBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.colors.textSecondary,
  },
  noteText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Theme.spacing.sm,
    paddingTop: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border + '40',
  },
});

export default TransactionCard;
