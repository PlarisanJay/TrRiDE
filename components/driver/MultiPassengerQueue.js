import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, ROUNDED, SHADOWS, SPACING, TYPOGRAPHY } from '../../theme';
import UserAvatar from '../UserAvatar';
import {
  QUEUE_STATUS,
  QUEUE_STATUS_LABELS,
  getQueueStatus,
  getSeatColor,
} from '../../data/rideQueue';

const STATUS_STYLES = {
  [QUEUE_STATUS.WAITING]: {
    pillBg: COLORS.surfaceContainerHigh,
    pillText: COLORS.onSurfaceVariant,
    icon: 'schedule',
  },
  [QUEUE_STATUS.HEADING]: {
    pillBg: '#dbeafe',
    pillText: '#1d4ed8',
    icon: 'navigation',
  },
  [QUEUE_STATUS.ON_BOARD]: {
    pillBg: '#dcfce7',
    pillText: '#15803d',
    icon: 'directions-car',
  },
  [QUEUE_STATUS.DROPPED_OFF]: {
    pillBg: COLORS.surfaceContainerHigh,
    pillText: COLORS.outline,
    icon: 'check-circle',
  },
  [QUEUE_STATUS.CANCELLED]: {
    pillBg: '#fee2e2',
    pillText: COLORS.error,
    icon: 'cancel',
  },
};

/**
 * Queue of every accepted passenger for one driver.
 * Cancelled cards stay in the list, turn red, and lose their action buttons.
 */
export default function MultiPassengerQueue({
  trips = [],
  seatNumbers,
  pickupQueue = [],
  nearestDropoffId = null,
  students = {},
  dropoffDistances = {},
  actingId = null,
  cancellingId = null,
  onPickup,
  onDropoff,
  onCancel,
  onCall,
  onChat,
}) {
  return (
    <View style={styles.list}>
      {trips.map((trip) => {
        const seatNumber = seatNumbers?.get(trip.id) || 1;
        const color = getSeatColor(seatNumber);
        const status = getQueueStatus(trip, pickupQueue);
        const statusStyle = STATUS_STYLES[status] || STATUS_STYLES[QUEUE_STATUS.WAITING];
        const student = students[trip.student_id];
        const isCancelled = status === QUEUE_STATUS.CANCELLED;
        const isDroppedOff = status === QUEUE_STATUS.DROPPED_OFF;
        const badgeColor = isCancelled
          ? COLORS.error
          : isDroppedOff
            ? '#16a34a'
            : color;
        const isOnBoard = status === QUEUE_STATUS.ON_BOARD;
        const isHeading = status === QUEUE_STATUS.HEADING;
        const isWaiting = status === QUEUE_STATUS.WAITING;
        const isNextDropoff = isOnBoard && nearestDropoffId === trip.id;
        const nearestDropoffSeat = nearestDropoffId
          ? seatNumbers?.get(nearestDropoffId)
          : null;
        const isActing = actingId === trip.id;
        const isCancelling = cancellingId === trip.id;
        const distanceText = dropoffDistances[trip.id];

        return (
          <View
            key={trip.id}
            style={[
              styles.card,
              SHADOWS.diffusion,
              isCancelled && styles.cardCancelled,
              isHeading && styles.cardHeading,
              isOnBoard && styles.cardOnBoard,
              isDroppedOff && styles.cardDropped,
            ]}
          >
            <View style={styles.header}>
              <View style={[styles.seatBadge, { backgroundColor: badgeColor }]}>
                <Text style={styles.seatBadgeText}>
                  {isCancelled ? '✕' : isDroppedOff ? '✓' : `P${seatNumber}`}
                </Text>
              </View>

              <UserAvatar
                uri={student?.avatar_url}
                name={student?.full_name || `Passenger ${seatNumber}`}
                size={40}
              />

              <View style={styles.headerText}>
                <Text
                  style={[styles.name, isCancelled && styles.mutedText]}
                  numberOfLines={1}
                >
                  {student?.full_name || `Passenger ${seatNumber}`}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {trip.passengers || 1} passenger{(trip.passengers || 1) > 1 ? 's' : ''}
                  {distanceText ? ` • ${distanceText} to drop-off` : ''}
                </Text>
              </View>

              <View style={[styles.statusPill, { backgroundColor: statusStyle.pillBg }]}>
                <MaterialIcons name={statusStyle.icon} size={13} color={statusStyle.pillText} />
                <Text style={[styles.statusPillText, { color: statusStyle.pillText }]}>
                  {QUEUE_STATUS_LABELS[status]}
                </Text>
              </View>
            </View>

            <View style={styles.locations}>
              <View style={styles.locationRow}>
                <MaterialIcons
                  name="trip-origin"
                  size={16}
                  color={isCancelled ? COLORS.outline : '#f97316'}
                />
                <Text
                  style={[styles.locationText, isCancelled && styles.mutedText]}
                  numberOfLines={1}
                >
                  {trip.pickup_text || 'Pick-up point'}
                </Text>
              </View>
              <View style={styles.locationRow}>
                <MaterialIcons
                  name="location-on"
                  size={16}
                  color={isCancelled ? COLORS.outline : '#2563eb'}
                />
                <Text
                  style={[styles.locationText, isCancelled && styles.mutedText]}
                  numberOfLines={1}
                >
                  {trip.dest_text || 'Drop-off point'}
                </Text>
              </View>
            </View>

            {isHeading ? (
              <View style={styles.hintRow}>
                <MaterialIcons name="lock" size={13} color="#1d4ed8" />
                <Text style={styles.hintHeading}>
                  Locked: this passenger is the current pick-up target.
                </Text>
              </View>
            ) : null}

            {isNextDropoff ? (
              <View style={styles.hintRow}>
                <MaterialIcons name="near-me" size={13} color="#15803d" />
                <Text style={styles.hintDropoff}>Next drop-off by distance.</Text>
              </View>
            ) : null}

            {isWaiting ? (
              <View style={styles.hintRow}>
                <MaterialIcons name="hourglass-empty" size={13} color={COLORS.onSurfaceVariant} />
                <Text style={styles.hintWaiting}>
                  Waiting — pick-up order is decided by the app.
                </Text>
              </View>
            ) : null}

            {!isCancelled && !isDroppedOff ? (
              <View style={styles.actions}>
                <View style={styles.secondaryActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    activeOpacity={0.75}
                    onPress={() => onCall?.(trip)}
                  >
                    <MaterialIcons name="call" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    activeOpacity={0.75}
                    onPress={() => onChat?.(trip)}
                  >
                    <MaterialIcons name="chat" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  {trip.status === 'accepted' ? (
                    <TouchableOpacity
                      style={styles.cancelLink}
                      activeOpacity={0.7}
                      disabled={isCancelling || Boolean(actingId)}
                      onPress={() => onCancel?.(trip)}
                    >
                      {isCancelling ? (
                        <ActivityIndicator size="small" color={COLORS.error} />
                      ) : (
                        <Text style={styles.cancelLinkText}>Cancel</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>

                {isHeading ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: color }]}
                    activeOpacity={0.9}
                    disabled={Boolean(actingId)}
                    onPress={() => onPickup?.(trip)}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <MaterialIcons name="person-pin-circle" size={19} color="#ffffff" />
                        <Text style={styles.primaryBtnText}>Pick Up Passenger</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : isOnBoard && isNextDropoff ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.dropoffBtn]}
                    activeOpacity={0.9}
                    disabled={Boolean(actingId)}
                    onPress={() => onDropoff?.(trip)}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <MaterialIcons name="check" size={19} color="#ffffff" />
                        <Text style={styles.primaryBtnText}>Drop Off Passenger</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : isOnBoard ? (
                  <View style={styles.waitingBtn}>
                    <MaterialIcons name="lock-clock" size={17} color={COLORS.outline} />
                    <Text style={styles.waitingBtnText}>
                      {nearestDropoffSeat
                        ? `Next drop-off: P${nearestDropoffSeat}`
                        : 'Waiting for drop-off turn'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.waitingBtn}>
                    <MaterialIcons name="lock-clock" size={17} color={COLORS.outline} />
                    <Text style={styles.waitingBtnText}>Not next yet</Text>
                  </View>
                )}
              </View>
            ) : null}

            {isDroppedOff ? (
              <View style={styles.finishedRow}>
                <MaterialIcons name="check-circle" size={16} color="#15803d" />
                <Text style={styles.finishedText}>Drop-off complete</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: ROUNDED.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: SPACING.md,
    gap: 10,
  },
  cardHeading: {
    borderColor: '#93c5fd',
    backgroundColor: '#f8fbff',
  },
  cardOnBoard: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  cardCancelled: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  cardDropped: {
    backgroundColor: '#f8fafc',
    opacity: 0.82,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  seatBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  headerText: {
    flex: 1,
  },
  name: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  meta: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 1,
    maxWidth: 128,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  locations: {
    gap: 5,
    paddingLeft: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  locationText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.onSurface,
    flex: 1,
  },
  mutedText: {
    color: COLORS.outline,
    textDecorationLine: 'line-through',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hintHeading: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: '#1d4ed8',
    flex: 1,
  },
  hintDropoff: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: '#15803d',
    fontWeight: '700',
  },
  hintWaiting: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
  actions: {
    gap: 8,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  cancelLink: {
    height: 36,
    minWidth: 48,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  cancelLinkText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.error,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    width: '100%',
  },
  dropoffBtn: {
    backgroundColor: '#16a34a',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  waitingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    width: '100%',
  },
  waitingBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.outline,
  },
  finishedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  finishedText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
});
