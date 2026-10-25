import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { createReport, canReportUser } from '../../data/reports';
import { alertDialog, confirmDialog } from '../../lib/dialog';

const REASONS = [
  'Harassment',
  'Fraud/Scam',
  'Inappropriate behavior',
  'Fake account',
  'Unsafe driving',
  'Other',
];

export default function ReportUserScreen({ userProfile, reportedUser, onBack, onSubmitted }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      await alertDialog({ title: 'Select a reason', message: 'Please select a reason for reporting.' });
      return;
    }

    const check = await canReportUser(userProfile.id, reportedUser.id);
    if (!check.allowed) {
      await alertDialog({ title: 'Cannot report', message: check.reason });
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Submit report',
      message: 'Your report will be sent to admin. The reported user will not see your report details or identity.',
      confirmText: 'Submit',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await createReport({
        reporterId: userProfile.id,
        reportedId: reportedUser.id,
        reason: selectedReason,
        details: details.trim(),
        evidence: [],
      });
      await alertDialog({ title: 'Report submitted', message: 'Your report has been submitted. You can view it in My Reports.' });
      if (onSubmitted) onSubmitted();
      else onBack();
    } catch (e) {
      await alertDialog({ title: 'Error', message: e.message || 'Failed to submit report' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report User</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Reporting</Text>
          <Text style={styles.reportedName}>{reportedUser?.full_name || 'User'}</Text>
          <Text style={styles.note}>The reported user will never see report details or your identity.</Text>
        </View>

        <View style={[styles.card, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Reason</Text>
          <View style={styles.reasons}>
            {REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonBtn, selectedReason === reason && styles.reasonBtnActive]}
                onPress={() => setSelectedReason(reason)}
              >
                <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextActive]}>{reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Details (optional)</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Provide additional details..."
            placeholderTextColor={COLORS.onSurfaceVariant}
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit Report'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.onSurface, fontWeight: '600' },
  scrollContent: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },
  card: { backgroundColor: COLORS.surface, borderRadius: ROUNDED.lg, padding: SPACING.md, gap: SPACING.sm },
  sectionTitle: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.onSurface },
  reportedName: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  note: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  reasonBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: ROUNDED.full,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  reasonBtnActive: { backgroundColor: COLORS.primary },
  reasonText: { ...TYPOGRAPHY.body, color: COLORS.onSurface },
  reasonTextActive: { color: '#ffffff', fontWeight: '600' },
  textArea: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    minHeight: 100,
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
  },
  submitBtn: {
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.md,
    borderRadius: ROUNDED.lg,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { ...TYPOGRAPHY.button, color: '#ffffff' },
});
