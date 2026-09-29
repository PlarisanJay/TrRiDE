import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Modal, ActivityIndicator, Platform, Keyboard } from 'react-native';
import { alertDialog } from '../../lib/dialog';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  ELEVATION,
  INK,
  CANVAS,
  ACCENT,
  BORDERS,
} from '../../theme';
import { TOLEDO_CITY, fetchRoute, haversineDistance, reverseGeocode, formatDistanceText, formatDurationText } from '../../config/mapConfig';
import { createTrip } from '../../data/trips';
import MapPreview from '../../components/MapPreview';
import PlacesAutocomplete from '../../components/PlacesAutocomplete';
import { useWideWeb, wideMapStyles } from '../../lib/webLayout';

export default function BookRideScreen({ userProfile, onConfirmBooking, onNavigate }) {
  const [pickup, setPickup] = useState('Current Location');
  const [pickupCoords, setPickupCoords] = useState({ latitude: TOLEDO_CITY.latitude, longitude: TOLEDO_CITY.longitude });
  const [userEditedPickup, setUserEditedPickup] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [scheduleMode, setScheduleMode] = useState('now'); // 'now' or 'later'
  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mapRegion, setMapRegion] = useState(TOLEDO_CITY);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDuration, setRouteDuration] = useState('30 MIN');
  const [routeDistance, setRouteDistance] = useState('');
  const [routeDurationDetail, setRouteDurationDetail] = useState('');
  const [booking, setBooking] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activeField, setActiveField] = useState(null); // 'pickup' | 'destination' | null

  const mapRef = useRef(null);
  const isWideWeb = useWideWeb();

  // Auto-restore map when keyboard dismisses
  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsSearchActive(false);
      setActiveField(null);
    });
    return () => {
      hideSub.remove();
    };
  }, []);

  // Get current position with high accuracy on web (navigator.geolocation)
  // or expo-location on native. expo-location on web does not forward
  // enableHighAccuracy which causes browsers to use the coarse IP-based location.
  const getAccuratePosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      } else {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          .then(resolve)
          .catch(() => Location.getLastKnownPositionAsync({}).then(resolve).catch(reject));
      }
    });
  }, []);

  // Auto-detect current location on mount and fill pickup location with high accuracy
  useEffect(() => {
    let isMounted = true;
    const autoDetectCurrentLocation = async () => {
      try {
        // On web, navigator.geolocation handles its own permission prompt
        if (Platform.OS !== 'web') {
          const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
          if (status !== 'granted') return;
        }
        const loc = await getAccuratePosition().catch(() => null);
        if (loc?.coords && isMounted) {
          const newCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setPickupCoords(newCoords);
          setMapRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          });
          mapRef.current?.recenter(loc.coords.latitude, loc.coords.longitude);

          const addr = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
          if (isMounted && !userEditedPickup && addr) {
            setPickup(addr);
          }
        }
      } catch (e) {
        console.warn('Initial current location error:', e);
      }
    };

    autoDetectCurrentLocation();
    return () => {
      isMounted = false;
    };
  }, []);

  // Manual GPS location detection when user taps recenter button (high accuracy)
  const handleRecenter = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const hasServices = await Location.hasServicesEnabledAsync().catch(() => false);
        if (!hasServices) {
          alertDialog({ title: 'Location Disabled', message: 'Please turn on GPS on your device.' });
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        if (status !== 'granted') {
          if (pickupCoords) mapRef.current?.recenter(pickupCoords.latitude, pickupCoords.longitude);
          return;
        }
      }

      const loc = await getAccuratePosition().catch(() => null);
      if (loc?.coords) {
        const newCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setPickupCoords(newCoords);
        setMapRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        });
        mapRef.current?.recenter(loc.coords.latitude, loc.coords.longitude);

        const addr = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
        if (addr && !userEditedPickup) {
          setPickup(addr);
        }
        return;
      }
    } catch (e) {
      console.warn('Recenter location error:', e);
    }

    if (pickupCoords) {
      mapRef.current?.recenter(pickupCoords.latitude, pickupCoords.longitude);
    } else {
      mapRef.current?.recenter(TOLEDO_CITY.latitude, TOLEDO_CITY.longitude);
    }
  }, [pickupCoords, userEditedPickup, getAccuratePosition]);

  // Pinpoint on map: tap map to accurately set pickup or destination coordinates
  const handleMapPress = useCallback(async (coords) => {
    if (!coords?.latitude || !coords?.longitude) return;
    const newCoords = { latitude: coords.latitude, longitude: coords.longitude };
    if (activeField === 'pickup') {
      setPickupCoords(newCoords);
      setUserEditedPickup(true);
      const addr = await reverseGeocode(coords.latitude, coords.longitude);
      if (addr) setPickup(addr);
    } else {
      setDestinationCoords(newCoords);
      const addr = await reverseGeocode(coords.latitude, coords.longitude);
      if (addr) setDestination(addr);
    }
  }, [activeField]);

  // Fetch route when both pickup and destination are present
  useEffect(() => {
    let isMounted = true;
    if (pickupCoords?.latitude && destinationCoords?.latitude) {
      fetchRoute(pickupCoords, destinationCoords).then((res) => {
        if (isMounted && res) {
          setRouteCoordinates(res.coordinates || []);
          setRouteDuration(res.durationText || '30 MIN');
          setRouteDistance(res.distanceText || '');
          setRouteDurationDetail(res.durationText || '');
        }
      }).catch(() => {
        if (isMounted) {
          const distKm = haversineDistance(
            pickupCoords.latitude,
            pickupCoords.longitude,
            destinationCoords.latitude,
            destinationCoords.longitude
          );
          const distMeters = Math.round(distKm * 1000);
          setRouteDistance(formatDistanceText(distMeters));
          const mins = Math.max(1, Math.round(distKm * 3));
          const durStr = formatDurationText(mins);
          setRouteDuration(durStr);
          setRouteDurationDetail(durStr);
        }
      });
    } else {
      setRouteCoordinates([]);
      setRouteDistance('');
      setRouteDurationDetail('');
    }
    return () => {
      isMounted = false;
    };
  }, [pickupCoords?.latitude, pickupCoords?.longitude, destinationCoords?.latitude, destinationCoords?.longitude]);

  // Fit bounds to show both pickup and destination
  const handleFitBounds = useCallback(() => {
    mapRef.current?.fitBounds();
  }, []);

  const handleConfirm = () => {
    if (!pickupCoords || !destinationCoords) {
      alertDialog({ title: 'Missing Info', message: 'Please select both pickup and destination locations.' });
      return;
    }
    setShowConfirmation(true);
  };

  const handleFinalConfirm = async () => {
    setBooking(true);
    try {
      const trip = await createTrip({
        student_id: userProfile?.id,
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
      onConfirmBooking?.(trip.id);
    } catch (e) {
      alertDialog({ title: 'Error', message: 'Failed to create trip. Please try again.' });
    } finally {
      setBooking(false);
    }
  };

  const getInitials = () => {
    if (userProfile?.full_name) {
      const parts = userProfile.full_name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return userProfile.full_name.slice(0, 2).toUpperCase();
    }
    return 'JP';
  };

  const mapMarkers = useMemo(() => [
    ...(pickupCoords
      ? [{ id: 'pickup', coordinate: pickupCoords, type: 'pickup', color: ACCENT.orange }]
      : []),
    ...(destinationCoords
      ? [{ id: 'destination', coordinate: destinationCoords, type: 'destination', color: ACCENT.blue }]
      : []),
  ], [pickupCoords?.latitude, pickupCoords?.longitude, destinationCoords?.latitude, destinationCoords?.longitude]);

  return (
    <KeyboardAvoidingView
      // Matches Login/Register/Messages. 'height' on Android double-shrinks
      // now that app.json sets softwareKeyboardLayoutMode:"resize".
      behavior="padding"
      style={styles.container}
    >
      {/* Top Map Section - smoothly collapses when searching so keyboard doesn't overlap, or compact when sheet expanded */}
      <View
        style={[
          styles.mapSection,
          isWideWeb && wideMapStyles.mapSection,
          !isWideWeb && isSearchActive && styles.mapSectionCollapsed,
          !isWideWeb && !isSearchActive && isSheetExpanded && styles.mapSectionCompact,
        ]}
      >
        <MapPreview
          ref={mapRef}
          region={mapRegion}
          markers={mapMarkers}
          routeCoordinates={routeCoordinates}
          durationText={routeDuration}
          scrollEnabled={true}
          onMapPress={handleMapPress}
        />

        {/* Floating Back Button */}
        <View style={[styles.floatingHeaderArea, isWideWeb && wideMapStyles.floatingHeaderArea]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingBackBtn}
            activeOpacity={0.85}
            onPress={() => onNavigate?.('Home')}
          >
            <MaterialIcons name="arrow-back" size={22} color={INK.body} />
          </TouchableOpacity>

          {/* Floating Profile Initials Badge */}
          <TouchableOpacity
            style={styles.floatingAvatarBtn}
            activeOpacity={0.85}
            onPress={() => onNavigate?.('Profile')}
          >
            <View style={[styles.floatingAvatarFill, { backgroundColor: ACCENT.blue }]}>
              <Text style={styles.avatarInitialsText}>{getInitials()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Floating Map Action Buttons on bottom right of map preview */}
        <View style={styles.floatingMapActions}>
          <TouchableOpacity
            style={styles.mapActionBtn}
            activeOpacity={0.8}
            onPress={handleRecenter}
          >
            <MaterialIcons name="my-location" size={22} color={INK.body} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapActionBtn}
            activeOpacity={0.8}
            onPress={handleFitBounds}
          >
            <MaterialIcons name="crop-free" size={22} color={INK.body} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Sheet Card */}
      <View
        style={[
          styles.sheetContainer,
          isWideWeb && wideMapStyles.sheetContainer,
          !isWideWeb && isSearchActive && styles.sheetContainerActive,
          !isWideWeb && !isSearchActive && isSheetExpanded && styles.sheetContainerExpanded,
          isWideWeb && isSearchActive && wideMapStyles.sheetSearch,
        ]}
      >
        {isSearchActive ? (
          <View style={styles.searchHeaderBar}>
            <TouchableOpacity
              style={styles.searchBackBtn}
              onPress={() => {
                Keyboard.dismiss();
                setIsSearchActive(false);
                setActiveField(null);
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color={INK.body} />
            </TouchableOpacity>
            <Text style={styles.searchHeaderTitle}>
              {activeField === 'pickup' ? 'Select Pick-up Point' : 'Select Destination'}
            </Text>
            <TouchableOpacity
              style={styles.searchDoneBtn}
              onPress={() => {
                Keyboard.dismiss();
                setIsSearchActive(false);
                setActiveField(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.searchDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.dragHandleTouchArea}
            activeOpacity={0.8}
            onPress={() => setIsSheetExpanded((prev) => !prev)}
          >
            <View style={styles.dragHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Fill the following</Text>
              <View style={styles.expandHintBadge}>
                <MaterialIcons
                  name={isSheetExpanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
                  size={18}
                  color={INK.muted}
                />
              </View>
            </View>
          </TouchableOpacity>
        )}

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
        >
          {/* Connected Inputs Container */}
          <View style={styles.inputsSection}>
            {/* Left Connected Route Indicator */}
            <View style={styles.connectedIndicator}>
              <View style={styles.orangeDot} />
              <View style={styles.connectorLine} />
              <View style={styles.greenDot} />
            </View>

            {/* Input Boxes */}
            <View style={styles.inputsColumn}>
              {/* Pickup Input Box */}
              <View
                style={[
                  styles.inputCard,
                  activeField === 'pickup' && styles.inputCardActive,
                  { zIndex: activeField === 'pickup' ? 9999 : 10 },
                ]}
              >
                <View style={styles.inputIconContainer}>
                  {/* Person Silhouette Icon */}
                  <MaterialIcons name="person-outline" size={22} color={ACCENT.orange} />
                </View>
                <View style={styles.inputDivider} />
                <View style={styles.autocompleteWrapper}>
                  <PlacesAutocomplete
                    borderless
                    placeholder="Pick up Location"
                    value={pickup}
                    onChangeText={(txt) => {
                      setUserEditedPickup(true);
                      setPickup(txt);
                    }}
                    onFocus={() => {
                      setIsSearchActive(true);
                      setActiveField('pickup');
                    }}
                    onSelect={(loc) => {
                      setUserEditedPickup(true);
                      setPickup(loc.text);
                      setPickupCoords({ latitude: loc.latitude, longitude: loc.longitude });
                      Keyboard.dismiss();
                      setIsSearchActive(false);
                      setActiveField(null);
                    }}
                  />
                </View>
              </View>

              {/* Destination Input Box */}
              <View
                style={[
                  styles.inputCard,
                  { marginTop: 12 },
                  activeField === 'destination' && styles.inputCardActive,
                  { zIndex: activeField === 'destination' ? 9999 : 5 },
                ]}
              >
                <View style={styles.inputIconContainer}>
                  {/* Blue Checkmark Badge */}
                  <MaterialIcons name="check-circle" size={22} color={ACCENT.blue} />
                </View>
                <View style={styles.inputDivider} />
                <View style={styles.autocompleteWrapper}>
                  <PlacesAutocomplete
                    borderless
                    placeholder="Where to?"
                    value={destination}
                    onChangeText={setDestination}
                    onFocus={() => {
                      setIsSearchActive(true);
                      setActiveField('destination');
                    }}
                    onSelect={(loc) => {
                      setDestination(loc.text);
                      setDestinationCoords({ latitude: loc.latitude, longitude: loc.longitude });
                      Keyboard.dismiss();
                      setIsSearchActive(false);
                      setActiveField(null);
                    }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Ride Now / Schedule Later Segmented Toggle */}
          <View style={styles.toggleSegmentContainer}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                scheduleMode === 'now' && styles.segmentBtnActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setScheduleMode('now')}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  scheduleMode === 'now' && styles.segmentBtnTextActive,
                ]}
              >
                Ride Now
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                scheduleMode === 'later' && styles.segmentBtnActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setScheduleMode('later')}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  scheduleMode === 'later' && styles.segmentBtnTextActive,
                ]}
              >
                Schedule Later
              </Text>
            </TouchableOpacity>
          </View>

          {/* Schedule Picker if "later" */}
          {scheduleMode === 'later' && (
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleCol}>
                <Text style={styles.scheduleLabel}>Date</Text>
                <TextInput
                  style={styles.scheduleInputField}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={INK.subtle}
                  value={date}
                  onChangeText={setDate}
                />
              </View>
              <View style={styles.scheduleCol}>
                <Text style={styles.scheduleLabel}>Time</Text>
                <TextInput
                  style={styles.scheduleInputField}
                  placeholder="HH:MM AM/PM"
                  placeholderTextColor={INK.subtle}
                  value={time}
                  onChangeText={setTime}
                />
              </View>
            </View>
          )}

          {/* Passengers Section (1 to 7 buttons) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Passengers</Text>
            <View style={styles.passengersRow}>
              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.passengerBox,
                    passengers === num && styles.passengerBoxActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setPassengers(num)}
                >
                  <Text
                    style={[
                      styles.passengerBoxText,
                      passengers === num && styles.passengerBoxTextActive,
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Special Notes Section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Special Notes</Text>
            <TextInput
              style={styles.notesBox}
              placeholder="e.g. Kuha ko amoa"
              placeholderTextColor={INK.subtle}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => {
                setActiveField('notes');
              }}
            />
          </View>

          {/* Trip Route Distance & Duration Info */}
          {(routeDistance || routeDurationDetail) ? (
            <View style={styles.routeSummaryCard}>
              <View style={styles.routeSummaryItem}>
                <View style={[styles.routeSummaryIconBg, { backgroundColor: ACCENT.blueWash }]}>
                  <MaterialIcons name="straighten" size={18} color={ACCENT.blue} />
                </View>
                <View style={styles.routeSummaryTextGroup}>
                  <Text style={styles.routeSummaryLabel}>DISTANCE</Text>
                  <Text style={styles.routeSummaryValue}>{routeDistance || 'Calculating...'}</Text>
                </View>
              </View>
              <View style={styles.routeSummaryDivider} />
              <View style={styles.routeSummaryItem}>
                <View style={[styles.routeSummaryIconBg, { backgroundColor: ACCENT.orangeWash }]}>
                  <MaterialIcons name="schedule" size={18} color={ACCENT.orangeDeep} />
                </View>
                <View style={styles.routeSummaryTextGroup}>
                  <Text style={styles.routeSummaryLabel}>TRAVEL TIME</Text>
                  <Text style={styles.routeSummaryValue}>{routeDurationDetail || 'Calculating...'}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Confirm Booking Full Width Button */}
          <TouchableOpacity
            style={styles.btnConfirmBooking}
            activeOpacity={0.88}
            onPress={handleConfirm}
          >
            <View style={[styles.btnConfirmBookingFill, { backgroundColor: ACCENT.blue }]}>
              <Text style={styles.btnConfirmBookingText}>Confirm Booking</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
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
                <MaterialIcons name="close" size={24} color={INK.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalDetails}>
              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: ACCENT.orangeSoft }]}>
                  <MaterialIcons name="trip-origin" size={18} color={ACCENT.orangeDeep} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Pickup</Text>
                  <Text style={styles.modalDetailValue} numberOfLines={2}>{pickup}</Text>
                </View>
              </View>

              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: ACCENT.blueSoft }]}>
                  <MaterialIcons name="location-on" size={18} color={ACCENT.blue} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Destination</Text>
                  <Text style={styles.modalDetailValue} numberOfLines={2}>{destination || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.modalDetailRow}>
                <View style={[styles.modalIconBg, { backgroundColor: ACCENT.skySoft }]}>
                  <MaterialIcons name="people" size={18} color={ACCENT.sky} />
                </View>
                <View style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Passengers</Text>
                  <Text style={styles.modalDetailValue}>{passengers} passenger{passengers > 1 ? 's' : ''}</Text>
                </View>
              </View>

              {scheduleMode === 'later' && (date || time) && (
                <View style={styles.modalDetailRow}>
                  <View style={[styles.modalIconBg, { backgroundColor: CANVAS.sunken }]}>
                    <MaterialIcons name="schedule" size={18} color={INK.slate} />
                  </View>
                  <View style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Schedule</Text>
                    <Text style={styles.modalDetailValue}>{date || 'N/A'} {time || ''}</Text>
                  </View>
                </View>
              )}

              {notes ? (
                <View style={styles.modalDetailRow}>
                  <View style={[styles.modalIconBg, { backgroundColor: CANVAS.sunken }]}>
                    <MaterialIcons name="note" size={18} color={INK.muted} />
                  </View>
                  <View style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Notes</Text>
                    <Text style={styles.modalDetailValue} numberOfLines={2}>{notes}</Text>
                  </View>
                </View>
              ) : null}

              {/* Trip Distance & Estimated Travel Time Badge */}
              {(routeDistance || routeDurationDetail) ? (
                <View style={styles.modalRouteSummaryRow}>
                  <View style={styles.modalRouteItem}>
                    <View style={[styles.modalRouteIconBg, { backgroundColor: ACCENT.blueWash }]}>
                      <MaterialIcons name="straighten" size={16} color={ACCENT.blue} />
                    </View>
                    <View style={styles.modalRouteTextWrap}>
                      <Text style={styles.modalRouteLabel}>Distance</Text>
                      <Text style={styles.modalRouteValue}>{routeDistance || '--'}</Text>
                    </View>
                  </View>
                  <View style={styles.modalRouteDivider} />
                  <View style={styles.modalRouteItem}>
                    <View style={[styles.modalRouteIconBg, { backgroundColor: ACCENT.orangeWash }]}>
                      <MaterialIcons name="schedule" size={16} color={ACCENT.orangeDeep} />
                    </View>
                    <View style={styles.modalRouteTextWrap}>
                      <Text style={styles.modalRouteLabel}>Travel Time</Text>
                      <Text style={styles.modalRouteValue}>{routeDurationDetail || '--'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
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
                style={[styles.modalBtnFinalConfirm, booking && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleFinalConfirm}
                disabled={booking}
              >
                <View style={[styles.modalBtnFinalConfirmFill, { backgroundColor: ACCENT.blue }]}>
                  {booking ? (
                    <ActivityIndicator size="small" color={CANVAS.raised} />
                  ) : (
                    <Text style={styles.modalBtnFinalConfirmText}>Confirm Booking</Text>
                  )}
                </View>
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
    backgroundColor: CANVAS.raised,
  },
  mapSection: {
    flex: 0.75,
    minHeight: 200,
    position: 'relative',
    backgroundColor: CANVAS.sunken,
  },
  mapSectionCollapsed: {
    flex: 0,
    height: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  mapSectionCompact: {
    flex: 0.45,
    minHeight: 160,
  },
  floatingHeaderArea: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 14 : 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  // Floating map controls sit on imagery, so they need enough lift to
  // separate from it. ELEVATION.lg keeps the shadow soft rather than the
  // harder black drop shadow these had.
  floatingBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CANVAS.raised,
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.lg,
  },
  // The fill is a GRADIENTS.brandBright LinearGradient in the JSX.
  floatingAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // borderRadius does not clip children in React Native; without this the
    // gradient fill renders as a square.
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.glow,
  },
  floatingAvatarFill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitialsText: {
    color: CANVAS.raised,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  floatingMapActions: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    gap: 10,
    zIndex: 50,
  },
  mapActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: CANVAS.raised,
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.lg,
    // The 1px rgba(0,0,0,0.05) ring was doing the job of a shadow; ELEVATION
    // now supplies that separation, so only a whisper of a hairline is left.
    ...BORDERS.hair,
  },
  // The sheet overlaps the map, so it needs a pronounced lift. This is the
  // one surface in the app where a strong shadow is load-bearing.
  sheetContainer: {
    flex: 1.25,
    backgroundColor: CANVAS.raised,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    ...ELEVATION.lg,
    zIndex: 20,
  },
  sheetContainerExpanded: {
    flex: 1.55,
    marginTop: -20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContainerActive: {
    flex: 1,
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
  },
  searchHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
    backgroundColor: CANVAS.raised,
    zIndex: 100,
  },
  searchBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CANVAS.sunken,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: INK.strong,
  },
  searchDoneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchDoneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT.blue,
  },
  dragHandleTouchArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 20,
    width: '100%',
  },
  dragHandle: {
    width: 54,
    height: 4,
    borderRadius: 2,
    backgroundColor: INK.faint,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: INK.strong,
    marginBottom: 0,
  },
  expandHintBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CANVAS.sunken,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  inputsSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    zIndex: 100,
  },
  connectedIndicator: {
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    paddingVertical: 14,
  },
  orangeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: ACCENT.orange,
  },
  connectorLine: {
    width: 1.5,
    height: 42,
    backgroundColor: INK.faint,
    marginVertical: 4,
  },
  greenDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: ACCENT.greenBright,
  },
  inputsColumn: {
    flex: 1,
    zIndex: 100,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    ...BORDERS.strong,
    borderRadius: 12,
    backgroundColor: CANVAS.raised,
    height: 48,
  },
  // Focus ring. Kept as a real 1.5px stroke because this is the one place a
  // border is doing accessibility work (visible focus target), not decoration.
  inputCardActive: {
    borderColor: ACCENT.blue,
    borderWidth: 1.5,
    ...ELEVATION.sm,
  },
  inputIconContainer: {
    width: 44,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  autocompleteWrapper: {
    flex: 1,
    paddingHorizontal: 12,
  },
  toggleSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: CANVAS.sunken,
    borderRadius: 10,
    ...BORDERS.soft,
    padding: 3,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Selected segment – solid background works reliably on both Android and web.
  segmentBtnActive: {
    backgroundColor: ACCENT.blue,
    ...ELEVATION.xs,
  },
  segmentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: INK.deep,
  },
  segmentBtnTextActive: {
    color: CANVAS.raised,
    fontWeight: '700',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  scheduleCol: {
    flex: 1,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: INK.muted,
    marginBottom: 4,
    marginLeft: 2,
  },
  // Sunken fields with a hairline rather than outlined boxes.
  scheduleInputField: {
    ...BORDERS.soft,
    backgroundColor: CANVAS.sunken,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    color: INK.strong,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: INK.strong,
    marginBottom: 10,
  },
  passengersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  passengerBox: {
    flex: 1,
    height: 42,
    ...BORDERS.strong,
    borderRadius: 8,
    backgroundColor: CANVAS.raised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerBoxActive: {
    borderColor: ACCENT.blue,
    borderWidth: 1.5,
    backgroundColor: ACCENT.blueWash,
  },
  passengerBoxText: {
    fontSize: 16,
    fontWeight: '600',
    color: INK.body,
  },
  passengerBoxTextActive: {
    color: ACCENT.blueDeep,
    fontWeight: '700',
  },
  notesBox: {
    ...BORDERS.soft,
    backgroundColor: CANVAS.sunken,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: INK.strong,
    textAlignVertical: 'top',
    height: 82,
  },
  // The main CTA. The touchable is full width by default (its parent is a
  // column with default alignItems: stretch); ELEVATION.glow gives it a tinted
  // lift instead of the old hard blue drop shadow.
  btnConfirmBooking: {
    height: 50,
    borderRadius: 10,
    // borderRadius does not clip children in React Native; without this the
    // gradient fill renders with square corners.
    overflow: 'hidden',
    marginTop: 8,
    ...ELEVATION.glow,
  },
  // alignSelf: 'stretch' is required because the parent's alignItems is not
  // stretch on the cross axis here; without it the fill only covers the label.
  btnConfirmBookingFill: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmBookingText: {
    color: CANVAS.raised,
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.lg,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: INK.strong,
  },
  modalDivider: {
    height: 1,
    backgroundColor: CANVAS.line,
    marginVertical: 12,
    marginHorizontal: 16,
  },
  modalDetails: {
    paddingHorizontal: 16,
    gap: 12,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 12,
    color: INK.muted,
  },
  modalDetailValue: {
    fontSize: 14,
    color: INK.strong,
    fontWeight: '600',
    marginTop: 2,
  },
  routeSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CANVAS.base,
    ...BORDERS.soft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 14,
  },
  routeSummaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeSummaryIconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeSummaryTextGroup: {
    flex: 1,
  },
  routeSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: INK.muted,
    letterSpacing: 0.5,
  },
  routeSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: INK.strong,
    marginTop: 1,
  },
  routeSummaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: INK.faint,
    marginHorizontal: 10,
  },
  modalRouteSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT.greenWash,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  modalRouteItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalRouteIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRouteTextWrap: {
    marginLeft: 8,
    flex: 1,
  },
  modalRouteLabel: {
    fontSize: 11,
    color: INK.muted,
    fontWeight: '600',
  },
  modalRouteValue: {
    fontSize: 14,
    color: INK.strong,
    fontWeight: '700',
    marginTop: 1,
  },
  modalRouteDivider: {
    width: 1,
    height: 26,
    backgroundColor: ACCENT.greenMid,
    marginHorizontal: 10,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  modalBtnEdit: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    ...BORDERS.strong,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
  },
  modalBtnEditText: {
    fontSize: 15,
    fontWeight: '600',
    color: INK.slate,
  },
  // Gradient fill lives in the JSX.
  modalBtnFinalConfirm: {
    flex: 1.6,
    height: 46,
    borderRadius: 10,
    overflow: 'hidden',
  },
  modalBtnFinalConfirmFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnFinalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: CANVAS.raised,
  },
});
