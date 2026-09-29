import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { alertDialog } from '../../lib/dialog';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  ROUNDED,
  ELEVATION,
  GRADIENTS,
  INK,
  CANVAS,
  ACCENT,
  BORDERS,
} from '../../theme';
import { updateUserProfile, uploadAvatar } from '../../data/auth';
import { getStudentTripStats, getDriverStats } from '../../data/trips';
import * as ImagePicker from 'expo-image-picker';
import UserAvatar from '../../components/UserAvatar';

export default function ProfileScreen({ userRole, userProfile, onLogout, onBack, onNavigate, onProfileUpdated }) {
  const isStudent = userRole === 'student';

  const [profile, setProfile] = useState(userProfile || {});
  const [showEditModal, setShowEditModal] = useState(false);
  const [profileStats, setProfileStats] = useState({ totalRides: 0, rating: 'â€”' });

  // Edit form state
  const [fullNameInput, setFullNameInput] = useState(profile?.full_name || (isStudent ? 'Student User' : 'Driver User'));
  const [phoneInput, setPhoneInput] = useState(profile?.phone || '');
  const [avatarUrlInput, setAvatarUrlInput] = useState(profile?.avatar_url || '');
  const [studentIdInput, setStudentIdInput] = useState(profile?.student_id || '');
  const [licenseNoInput, setLicenseNoInput] = useState(profile?.license_no || '');
  const [plateNumberInput, setPlateNumberInput] = useState(profile?.plate_number || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Sync state if userProfile changes
  useEffect(() => {
    if (userProfile) {
      setProfile(userProfile);
      setFullNameInput(userProfile.full_name || (isStudent ? 'Student User' : 'Driver User'));
      setPhoneInput(userProfile.phone || '');
      setAvatarUrlInput(userProfile.avatar_url || '');
      setStudentIdInput(userProfile.student_id || '');
      setLicenseNoInput(userProfile.license_no || '');
      setPlateNumberInput(userProfile.plate_number || '');
    }
  }, [userProfile, isStudent]);

  const roleTag = isStudent ? 'Student' : 'Driver';
  const email = profile?.email || 'user@triride.ph';
  const phone = profile?.phone || '0912 345 6789';

  const stat1Label = isStudent ? 'Rides' : 'Trips';

  // Load real stats
  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      try {
        if (isStudent) {
          const stats = await getStudentTripStats(userProfile?.id);
          if (mounted) setProfileStats({ totalRides: stats.totalRides, rating: 'â€”' });
        } else {
          const stats = await getDriverStats(userProfile?.id);
          if (mounted) setProfileStats({ totalRides: stats.completedRides, rating: 'â€”' });
        }
      } catch (e) {
        console.warn('Could not load profile stats:', e.message);
      }
    }
    if (userProfile?.id) loadStats();
    return () => { mounted = false; };
  }, [userProfile?.id, isStudent]);

  // Preset avatar URLs for quick selection
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=300',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
  ];

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alertDialog({
          title: 'Permission Required',
          message: 'Please allow access to your photo gallery to change your profile picture.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        const imageUri = asset.uri;
        const base64Data = asset.base64 || null;

        if (profile?.id) {
          setUploadingAvatar(true);
          try {
            const publicUrl = await uploadAvatar(profile.id, imageUri, base64Data);
            setAvatarUrlInput(publicUrl);
            const newProf = { ...profile, avatar_url: publicUrl };
            setProfile(newProf);
            if (onProfileUpdated) onProfileUpdated(newProf);
            alertDialog({ title: 'Success', message: 'Profile photo updated!' });
          } catch (e) {
            console.warn('Upload failed:', e.message);
            // Fallback: just set the local URI
            setAvatarUrlInput(imageUri);
            alertDialog({
              title: 'Upload Failed',
              message: 'Photo saved locally. Make sure the storage migration SQL has been run in Supabase.',
            });
          } finally {
            setUploadingAvatar(false);
          }
        } else {
          setAvatarUrlInput(imageUri);
        }
      }
    } catch (e) {
      console.warn('Image picker error:', e.message);
    }
  };

  const getInitials = (name) => {
    if (!name) return isStudent ? 'S' : 'D';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleSaveProfile = async () => {
    if (!fullNameInput.trim()) {
      alertDialog({ title: 'Error', message: 'Full name cannot be empty.' });
      return;
    }

    setSaving(true);
    const updates = {
      full_name: fullNameInput.trim(),
      phone: phoneInput.trim(),
      avatar_url: avatarUrlInput.trim(),
      ...(isStudent
        ? { student_id: studentIdInput.trim() }
        : { license_no: licenseNoInput.trim(), plate_number: plateNumberInput.trim() }),
    };

    try {
      if (profile?.id) {
        const updated = await updateUserProfile(profile.id, updates);
        setProfile(updated);
        if (onProfileUpdated) onProfileUpdated(updated);
      } else {
        const localProf = { ...profile, ...updates };
        setProfile(localProf);
        if (onProfileUpdated) onProfileUpdated(localProf);
      }
      setShowEditModal(false);
      alertDialog({ title: 'Success', message: 'Profile updated successfully!' });
    } catch (e) {
      console.log('Update profile error:', e?.message);
      // Fallback local update
      const localProf = { ...profile, ...updates };
      setProfile(localProf);
      if (onProfileUpdated) onProfileUpdated(localProf);
      setShowEditModal(false);
      alertDialog({ title: 'Updated', message: 'Profile info saved locally.' });
    }
    setSaving(false);
  };

  const menuItems = [
    {
      id: 'edit',
      title: 'Edit Profile',
      subtitle: 'Name, photo, and phone number',
      icon: 'person',
      iconColor: ACCENT.blueDeep,
      iconBg: ACCENT.blueWash,
      onPress: () => setShowEditModal(true),
    },
    {
      id: 'history',
      title: isStudent ? 'Ride History' : 'Trip History',
      subtitle: 'Past trips and receipts',
      icon: 'history',
      iconColor: ACCENT.orangeDeep,
      iconBg: ACCENT.orangeWash,
      // Students book rides -> MyOrders. Drivers have their own history
      // screen; MyOrders is student-only and showed drivers an empty list.
      onPress: () => onNavigate?.(isStudent ? 'MyOrders' : 'DriverCompletedRides'),
    },
    {
      id: 'settings',
      title: 'Settings',
      subtitle: 'Privacy and notifications',
      icon: 'settings',
      iconColor: INK.muted,
      iconBg: CANVAS.sunken,
      onPress: () => onNavigate?.('Settings'),
    },
  ];

  return (
    <View style={styles.container}>
      {/* Top Nav Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onBack} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={24} color={ACCENT.blueDeep} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card Info */}
        <LinearGradient
          {...GRADIENTS.dusk}
          style={[styles.profileCard, ELEVATION.md]}
        >
          <View style={styles.avatarContainer}>
            <UserAvatar uri={profile?.avatar_url} name={profile?.full_name} size={96} />

            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => setShowEditModal(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <LinearGradient {...GRADIENTS.brandBright} style={styles.editBtnFill}>
                <MaterialIcons name="camera-alt" size={16} color={CANVAS.raised} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{profile?.full_name || (isStudent ? 'Student User' : 'Driver User')}</Text>

          {profile?.username ? (
            <View style={styles.usernameTag}>
              <MaterialIcons name="alternate-email" size={13} color="rgba(255, 255, 255, 0.75)" />
              <Text style={styles.usernameText}>{profile.username}</Text>
            </View>
          ) : null}

          <View style={styles.roleTagContainer}>
            <Text style={styles.roleTagText}>{roleTag}</Text>
          </View>

          <View style={styles.contactDetails}>
            <View style={styles.contactItem}>
              <MaterialIcons name="mail-outline" size={15} color={COLORS.onSurfaceVariant} />
              <Text style={styles.contactText}>{email}</Text>
            </View>
            <View style={styles.contactItem}>
              <MaterialIcons name="phone" size={15} color={COLORS.onSurfaceVariant} />
              <Text style={styles.contactText}>{phone}</Text>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}>{stat1Label}</Text>
              <Text style={styles.statBoxValue}>{profileStats.totalRides}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}>Rating</Text>
              <Text style={styles.statBoxValue}>{profileStats.rating}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Credentials / Account Details Card */}
        <View style={styles.credentialsCard}>
          <Text style={styles.credentialsHeader}>
            {isStudent ? 'Student Information' : 'Driver Credentials'}
          </Text>

          {isStudent ? (
            <View style={styles.credentialRow}>
              <View style={styles.credentialLeft}>
                <MaterialIcons name="badge" size={18} color={ACCENT.blueDeep} />
                <Text style={styles.credentialLabel}>Student ID</Text>
              </View>
              <Text style={styles.credentialVal}>{profile?.student_id || 'Not specified'}</Text>
            </View>
          ) : (
            <>
              <View style={styles.credentialRow}>
                <View style={styles.credentialLeft}>
                  <MaterialIcons name="credit-card" size={18} color={ACCENT.blueDeep} />
                  <Text style={styles.credentialLabel}>License ID</Text>
                </View>
                <Text style={styles.credentialVal}>{profile?.license_no || 'Not specified'}</Text>
              </View>
              <View style={[styles.credentialRow, { borderBottomWidth: 0 }]}>
                <View style={styles.credentialLeft}>
                  <MaterialIcons name="confirmation-number" size={18} color={ACCENT.blueDeep} />
                  <Text style={styles.credentialLabel}>Plate Number</Text>
                </View>
                <Text style={styles.credentialVal}>{profile?.plate_number || 'Not specified'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Menu Options */}
        <View style={styles.menuCard}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                idx < menuItems.length - 1 && styles.menuItemBorder,
              ]}
              activeOpacity={0.7}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: item.iconBg }]}>
                  <MaterialIcons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={COLORS.outline} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.btnLogout} activeOpacity={0.8} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color={CANVAS.raised} style={styles.logoutIcon} />
          <Text style={styles.btnLogoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <MaterialIcons name="close" size={22} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Avatar Selection & Preview */}
            <Text style={styles.inputLabel}>Profile Picture</Text>

            {/* Current Avatar Preview */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <UserAvatar
                uri={avatarUrlInput}
                name={fullNameInput || 'User'}
                size={80}
                style={{ borderWidth: 3, borderColor: ACCENT.blue }}
              />
            </View>

            {/* Pick from Gallery Button */}
            <TouchableOpacity
              style={styles.pickGalleryBtn}
              activeOpacity={0.8}
              onPress={handlePickImage}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={ACCENT.blueDeep} />
              ) : (
                <MaterialIcons name="photo-library" size={20} color={ACCENT.blueDeep} />
              )}
              <Text style={styles.pickGalleryText}>
                {uploadingAvatar ? 'Uploading...' : 'Pick from Gallery'}
              </Text>
            </TouchableOpacity>

            {/* Preset Avatars */}
            <View style={styles.presetContainer}>
              {avatarPresets.map((url, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setAvatarUrlInput(url)}
                  style={[
                    styles.presetThumb,
                    avatarUrlInput === url && styles.presetThumbSelected,
                  ]}
                >
                  <Image source={{ uri: url }} style={styles.presetImage} />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.textInput}
              placeholder="Or paste image URL..."
              placeholderTextColor="rgba(115, 118, 134, 0.5)"
              value={avatarUrlInput}
              onChangeText={setAvatarUrlInput}
            />

            {/* Full Name */}
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter full name"
              placeholderTextColor="rgba(115, 118, 134, 0.5)"
              value={fullNameInput}
              onChangeText={setFullNameInput}
            />

            {/* Phone */}
            <Text style={styles.inputLabel}>Mobile Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="0912 345 6789"
              placeholderTextColor="rgba(115, 118, 134, 0.5)"
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
            />

            {/* Role Specific Credentials */}
            {isStudent ? (
              <>
                <Text style={styles.inputLabel}>Student ID</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 2024-00123"
                  placeholderTextColor="rgba(115, 118, 134, 0.5)"
                  value={studentIdInput}
                  onChangeText={setStudentIdInput}
                />
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>Driver's License ID</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. D01-23-456789"
                  placeholderTextColor="rgba(115, 118, 134, 0.5)"
                  value={licenseNoInput}
                  onChangeText={setLicenseNoInput}
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>Plate Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. ABC 1234 or 1234-AB"
                  placeholderTextColor="rgba(115, 118, 134, 0.5)"
                  value={plateNumberInput}
                  onChangeText={setPlateNumberInput}
                  autoCapitalize="characters"
                />
              </>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancelModal} onPress={() => setShowEditModal(false)}>
                <Text style={styles.btnCancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnSaveModal} onPress={handleSaveProfile} disabled={saving}>
                <LinearGradient {...GRADIENTS.brand} style={styles.btnSaveModal}>
                  {saving ? (
                    <ActivityIndicator size="small" color={CANVAS.raised} />
                  ) : (
                    <Text style={styles.btnSaveModalText}>Save Changes</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    // Soft hairline + ELEVATION.sm instead of a 1px outlineVariant rule.
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.05)',
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
    color: ACCENT.blueDeep,
    fontWeight: '800',
  },
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 40,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  // The fill is a GRADIENTS.dusk LinearGradient, so this style only carries
  // shape and depth. Everything nested inside it (name, roleTag, usernameTag,
  // contactText, statBox) is styled for a dark surface.
  profileCard: {
    borderRadius: ROUNDED.md,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  // avatar / fallbackAvatar / initialsText were removed: the avatar is
  // rendered by components/UserAvatar, so these had 0 references.
  editBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    // A white ring separates the button from the dark hero behind it
    // without needing a hard border.
    borderWidth: 2.5,
    borderColor: CANVAS.raised,
    borderRadius: 17,
    overflow: 'hidden',
    ...ELEVATION.md,
  },
  editBtnFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    ...TYPOGRAPHY.headlineMd,
    color: CANVAS.raised,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Translucent white on the dark hero, not a saturated brand fill.
  roleTagContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: SPACING.xs,
    marginBottom: 4,
  },
  roleTagText: {
    ...TYPOGRAPHY.caption,
    color: CANVAS.raised,
    fontWeight: '700',
  },
  usernameTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  usernameText: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '700',
  },
  contactDetails: {
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 0.8 rather than 0.7: the dusk ramp lightens toward #3a4a9c, and these
  // captions need headroom over the AA contrast threshold at the light end.
  contactText: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  credentialsCard: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  credentialsHeader: {
    ...TYPOGRAPHY.caption,
    color: ACCENT.blueDeep,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.07)',
  },
  credentialLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  credentialLabel: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  credentialVal: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
    justifyContent: 'center',
  },
  // Sits on the dark hero, so it is a translucent white well rather than a
  // grey box with a stroke.
  statBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: ROUNDED.default,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    minWidth: 100,
  },
  statBoxLabel: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255, 255, 255, 0.76)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statBoxValue: {
    ...TYPOGRAPHY.sectionTitle,
    color: CANVAS.raised,
    fontWeight: '700',
    marginTop: 2,
  },
  menuCard: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: ROUNDED.md,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.07)',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  menuIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  menuSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  btnLogout: {
    height: 52,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.error,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.md,
  },
  logoutIcon: {
    marginRight: 6,
  },
  btnLogoutText: {
    ...TYPOGRAPHY.button,
    color: CANVAS.raised,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  modalContent: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.lg,
    borderRadius: 20,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    ...TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  // Was an inline style object with a flat primaryFixed fill.
  pickGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT.blueWash,
    ...BORDERS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickGalleryText: {
    ...TYPOGRAPHY.button,
    color: ACCENT.blueDeep,
    fontSize: 14,
  },
  presetContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.xs,
  },
  presetThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  presetThumbSelected: {
    borderColor: ACCENT.blue,
  },
  presetImage: {
    width: '100%',
    height: '100%',
  },
  // Sunken field with a hairline, rather than a 1px outlined box.
  textInput: {
    backgroundColor: CANVAS.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.onSurface,
    marginBottom: SPACING.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  btnCancelModal: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    ...BORDERS.strong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelModalText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  btnSaveModal: {
    flex: 1.5,
    height: 46,
    borderRadius: 12,
    // borderRadius does not clip children in React Native; without this the
    // gradient fill renders with square corners.
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSaveModalText: {
    ...TYPOGRAPHY.button,
    color: CANVAS.raised,
  },
});
