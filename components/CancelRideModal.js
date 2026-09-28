import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, ROUNDED, SHADOWS } from '../theme';

const STUDENT_REASONS = [
  'Changed my mind',
  'Driver taking too long',
  'Found alternative ride',
  'Emergency / Plans changed',
  'Booked by mistake',
];

const DRIVER_REASONS = [
  'Vehicle issue / Flat tire',
  'Heavy traffic / Too far',
  'Emergency',
  'Passenger not at pickup',
  'Cannot accommodate ride',
];

export default function CancelRideModal({
  visible,
  role = 'student',
  tripStatus = 'pending',
  onClose,
  onConfirm,
  loading = false,
}) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customComment, setCustomComment] = useState('');

  const isInProgress = tripStatus === 'in_progress';
  const presets = role === 'driver' ? DRIVER_REASONS : STUDENT_REASONS;

  const handleSelectPreset = (reason) => {
    if (selectedReason === reason) {
      setSelectedReason('');
    } else {
      setSelectedReason(reason);
      if (!customComment) {
        setCustomComment(reason);
      }
    }
  };

  const handleConfirm = () => {
    const finalReason = customComment.trim() || selectedReason || 'No comment provided';
    onConfirm(finalReason);
  };

  const isSubmitDisabled = loading || (!selectedReason && !customComment.trim());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        // Was undefined on Android, so the reason TextInput sat under the
        // keyboard. 'padding' now that app.json sets
        // softwareKeyboardLayoutMode:"resize".
        behavior="padding"
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={loading ? undefined : onClose}
        />

        <View style={[styles.dialogCard, SHADOWS.card]}>
          {isInProgress ? (
            /* Block cancellation while riding */
            <View style={styles.contentWrap}>
              <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                <MaterialIcons name="block" size={32} color={COLORS.error} />
              </View>
              <Text style={styles.title}>Ride in Progress</Text>
              <Text style={styles.subtitle}>
                This ride is currently active and in progress. Rides cannot be cancelled while on the road. Please reach your destination safely.
              </Text>
              <TouchableOpacity
                style={styles.btnSecondary}
                activeOpacity={0.8}
                onPress={onClose}
              >
                <Text style={styles.btnSecondaryText}>Understood</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Prompt for comment & reason */
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentWrap}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                <MaterialIcons name="cancel" size={32} color={COLORS.error} />
              </View>

              <Text style={styles.title}>Cancel Ride</Text>
              <Text style={styles.subtitle}>
                Please leave a reason before cancelling. This order will be terminated and both parties will be notified.
              </Text>

              {/* Preset Chips */}
              <View style={styles.chipsContainer}>
                {presets.map((preset) => {
                  const isSelected = selectedReason === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      activeOpacity={0.7}
                      onPress={() => handleSelectPreset(preset)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Comment Input */}
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Explain why you are cancelling..."
                  placeholderTextColor="#94a3b8"
                  value={customComment}
                  onChangeText={setCustomComment}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  activeOpacity={0.8}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={styles.btnCancelText}>Keep Ride</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnConfirm, isSubmitDisabled && styles.btnConfirmDisabled]}
                  activeOpacity={0.8}
                  onPress={handleConfirm}
                  disabled={isSubmitDisabled}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.btnConfirmText}>Cancel Ride</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 10,
    maxHeight: '85%',
  },
  contentWrap: {
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
    width: '100%',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipSelected: {
    backgroundColor: '#fee2e2',
    borderColor: COLORS.error,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextSelected: {
    color: COLORS.error,
    fontWeight: '700',
  },
  inputWrap: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  input: {
    fontSize: 14,
    color: '#0f172a',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  btnConfirm: {
    flex: 1.3,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmDisabled: {
    opacity: 0.5,
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnSecondary: {
    marginTop: 10,
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
