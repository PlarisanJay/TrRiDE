import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image, KeyboardAvoidingView, Alert, Modal, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { TOLEDO_CITY } from '../../config/mapConfig';
import { createTrip, calculateFare } from '../../data/trips';
import { haversineDistance } from '../../config/mapConfig';
import MapPreview from '../../components/MapPreview';
import PlacesAutocomplete from '../../components/PlacesAutocomplete';

export default function BookRideScreen({ userProfile, onConfirmBooking, onNavigate }) {
  const [pickup, setPickup] = useState('University East Gate');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [scheduleMode, setScheduleMode] = useState('now'); // 'now' or 'later'
  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mapRegion, setMapRegion] = useState(TOLEDO_CITY);
  const [booking, setBooking] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc?.coords) {
          const region = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: TOLEDO_CITY.latitudeDelta,
            longitudeDelta: TOLEDO_CITY.longitudeDelta,
          };
          setMapRegion(region);
          setPickupCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      }
    })();
  }, []);

  const handleConfirm = async () => {
    if (!pickupCoords || !destinationCoords) {
      Alert.alert('Missing Info', 'Please select both pickup and destination locations.');
      return;
    }
    setShowConfirmation(true);
  };

  const handleFinalConfirm = async () => {
    setBooking(true);
    try {
      const trip = await createTrip({
        student_id: userProfile.id,
        pickup_lat: pickupCoords.latitude,
        pickup_lng: pickupCoords.longitude,
        pickup_text: pickup,
        dest_lat: destinationCoords.latitude,
        dest_lng: destinationCoords.longitude,
        dest_text: destination,
        passengers,
        notes,
      });
      setShowConfirmation(false);
      onConfirmBooking(trip.id);
    } catch (e) {
      Alert.alert('Error', 'Failed to create trip. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const estimatedFare = (() => {
    if (!pickupCoords || !destinationCoords) return null;
    const dist = haversineDistance(
      pickupCoords.latitude, pickupCoords.longitude,
      destinationCoords.latitude, destinationCoords.longitude
    );
    return calculateFare(dist);
  })();

  return (
    <KeyboardAvoidingView
      behavior={'padding'}
      style={styles.container}
    >
      {/* Top Nav Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => onNavigate('Home')}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Ride</Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')}>
          <Image
            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYnaiO3c1N_nqjL0sJ52siMtSKLXlLPftqA26x1R9Xg-ex19tuHq1MU0DTegs_U13cFbBKKUovIr7dTeRtWP6Rn15YZxjJ0bUJ_GKB7airdnDD_5ytyx2s-Fdb0RgIjWWWuuuJI-8BCf7XMzHVPBimEBbtPCuK4bggF4VGvdC3CQvyOahaQbmIvvLgmrpvK0_Ow9LNlJQd1ZUqkFRhjudKIj7AYp9erWu7ErI0hRnW3ps1nAAePlb6d2wIaWQa5IRp54CCWFeDiH8' }}
            style={styles.avatar}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Map Preview */}
        <View style={[styles.mapContainer, SHADOWS.diffusion]}>
          <MapPreview
            region={mapRegion}
            scrollEnabled={false}
            markers={[
              ...(pickupCoords
                ? [{ id: 'pickup', coordinate: pickupCoords, color: COLORS.primary }]
                : []),
              ...(destinationCoords
                ? [{ id: 'destination', coordinate: destinationCoords, color: '#006c49' }]
                : []),
            ]}
          />
        </View>

        {/* Location Inputs Card */}
        <View style={[styles.inputsCard, SHADOWS.diffusion]}>
          <View style={styles.connectingLineContainer}>
            <View style={styles.dotPrimary} />
            <View style={styles.line} />
            <View style={styles.dotSecondary} />
          </View>

          <View style={styles.inputsWrapper}>
            <PlacesAutocomplete
              icon="my-location"
              iconColor={COLORS.primary}
              placeholder="Pickup Location"
              value={pickup}
              onChangeText={setPickup}
              onSelect={(loc) => {
                setPickup(loc.text);
                setPickupCoords({ latitude: loc.latitude, longitude: loc.longitude });
              }}
            />

            <PlacesAutocomplete
              icon="location-on"
              iconColor={COLORS.error}
              placeholder="Where to?"
              value={destination}
              onChangeText={setDestination}
              onSelect={(loc) => {
                setDestination(loc.text);
                setDestinationCoords({ latitude: loc.latitude, longitude: loc.longitude });
              }}
            />
          </View>
        </View>

        {/* Time Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, scheduleMode === 'now' && styles.toggleBtnActive]}
            activeOpacity={0.8}
            onPress={() => setScheduleMode('now')}
          >
            <Text style={[styles.toggleBtnText, scheduleMode === 'now' && styles.toggleBtnTextActive]}>
              Ride Now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, scheduleMode === 'later' && styles.toggleBtnActive]}
            activeOpacity={0.8}
            onPress={() => setScheduleMode('later')}
          >
            <Text style={[styles.toggleBtnText, scheduleMode === 'later' && styles.toggleBtnTextActive]}>
              Schedule Later
            </Text>
          </TouchableOpacity>
        </View>

        {/* Schedule Picker (conditional) */}
        {scheduleMode === 'later' && (
          <View style={styles.schedulePicker}>
            <View style={styles.scheduleField}>
              <Text style={styles.scheduleLabel}>Date</Text>
              <TextInput
                style={styles.scheduleInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="rgba(115, 118, 134, 0.5)"
                value={date}
                onChangeText={setDate}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.scheduleLabel}>Time</Text>
              <TextInput
                style={styles.scheduleInput}
                placeholder="HH:MM AM/PM"
                placeholderTextColor="rgba(115, 118, 134, 0.5)"
                value={time}
                onChangeText={setTime}
              />
            </View>
          </View>
        )}

        {/* Passenger Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passengers</Text>
          <View style={styles.passengerRow}>
            {[1, 2, 3, 4].map((num) => (
              <TouchableOpacity
                key={num}
                style={[
                  styles.passengerPill,
                  passengers === num && styles.passengerPillActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setPassengers(num)}
              >
                <Text style={[styles.passengerText, passengers === num && styles.passengerTextActive]}>
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Special Notes */}
        <View style={[styles.section, { marginBottom: 160 }]}>
          <Text style={styles.sectionTitle}>Special Notes</Text>
          <TextInput
            style={styles.notesTextarea}
            placeholder="e.g. Near the blue gate, carrying a large bag..."
            placeholderTextColor="rgba(115, 118, 134, 0.5)"
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      </ScrollView>

      {/* Bottom Summary Card */}
      <View style={[styles.bottomCard, SHADOWS.diffusion]}>
        <View style={styles.bottomCardContent}>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <MaterialIcons name="verified" size={16} color={COLORS.secondary} />
              <Text style={styles.badgeText}>Safe Ride</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.btnConfirm} activeOpacity={0.9} onPress={handleConfirm}>
            <Text style={styles.btnConfirmText}>Confirm Booking</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Your Ride</Text>
              <TouchableOpacity onPress={() => setShowConfirmation(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalDetails}>
              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: COLORS.primaryFixed }]}>
                  <MaterialIcons name="trip-origin" size={18} color={COLORS.primary} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Pickup</Text>
                  <Text style={styles.modalDetailValue} numberOfLines={2}>{pickup}</Text>
                </View>
              </View>

              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: COLORS.errorContainer }]}>
                  <MaterialIcons name="location-on" size={18} color={COLORS.error} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Destination</Text>
                  <Text style={styles.modalDetailValue} numberOfLines={2}>{destination || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: COLORS.secondaryContainer }]}>
                  <MaterialIcons name="people" size={18} color={COLORS.secondary} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Passengers</Text>
                  <Text style={styles.modalDetailValue}>{passengers} passenger{passengers > 1 ? 's' : ''}</Text>
                </View>
              </View>

              {scheduleMode === 'later' && (date || time) && (
                <View style={styles.modalDetailRow}>
                  <View style={[styles.modalIconBg, { backgroundColor: COLORS.surfaceContainerHigh }]}>
                    <MaterialIcons name="schedule" size={18} color={COLORS.tertiary} />
                  </View>
                  <View style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Schedule</Text>
                    <Text style={styles.modalDetailValue}>{date || 'N/A'} {time || ''}</Text>
                  </View>
                </View>
              )}

              {notes ? (
                <View style={styles.modalDetailRow}>
                  <View style={[styles.modalIconBg, { backgroundColor: COLORS.surfaceContainerHigh }]}>
                    <MaterialIcons name="note" size={18} color={COLORS.onSurfaceVariant} />
                  </View>
                  <View style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Notes</Text>
                    <Text style={styles.modalDetailValue} numberOfLines={2}>{notes}</Text>
                  </View>
                </View>
              ) : null}

              {estimatedFare && (
                <View style={styles.modalFareRow}>
                  <Text style={styles.modalFareLabel}>Estimated Fare</Text>
                  <Text style={styles.modalFareValue}>₱{estimatedFare}</Text>
                </View>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnEdit}
                activeOpacity={0.8}
                onPress={() => setShowConfirmation(false)}
              >
                <Text style={styles.modalBtnEditText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, booking && { opacity: 0.7 }]}
                activeOpacity={0.8}
                onPress={handleFinalConfirm}
                disabled={booking}
              >
                {booking ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Confirm Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.primary,
    fontWeight: '800',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 40,
  },
  mapContainer: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  inputsCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  connectingLineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    paddingVertical: 10,
  },
  dotPrimary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  line: {
    width: 1,
    flex: 1,
    backgroundColor: COLORS.outlineVariant,
    marginVertical: 4,
  },
  dotSecondary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    backgroundColor: '#ffffff',
  },
  inputsWrapper: {
    flex: 1,
    gap: SPACING.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: ROUNDED.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: 4,
    marginBottom: SPACING.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: ROUNDED.default,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleBtnText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  toggleBtnTextActive: {
    color: COLORS.primary,
  },
  schedulePicker: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  scheduleField: {
    flex: 1,
    gap: 4,
  },
  scheduleLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.outline,
    marginLeft: 4,
  },
  scheduleInput: {
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    backgroundColor: '#ffffff',
    height: 48,
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
  },
  section: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  passengerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  passengerPill: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerPillActive: {
    borderColor: COLORS.primaryContainer,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  passengerText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  passengerTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  notesTextarea: {
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    backgroundColor: '#ffffff',
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
    textAlignVertical: 'top',
    height: 96,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: SPACING.md,
    paddingBottom: 35,
  },
  bottomCardContent: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    gap: SPACING.md,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,108,73,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.secondary,
    fontWeight: '600',
  },
  btnConfirm: {
    height: 56,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: ROUNDED.md,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  btnConfirmText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: ROUNDED.lg,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  modalTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  modalDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginVertical: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  modalDetails: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDetailText: {
    flex: 1,
  },
  modalDetailLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  modalDetailValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
    fontWeight: '500',
    marginTop: 2,
  },
  modalFareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalFareLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  modalFareValue: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.primary,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  modalBtnEdit: {
    flex: 1,
    height: 50,
    borderRadius: ROUNDED.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  modalBtnEditText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  modalBtnConfirm: {
    flex: 1.5,
    height: 50,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  modalBtnConfirmText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
});
