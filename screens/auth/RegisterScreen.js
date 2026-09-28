import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { signUp, checkUsernameAvailable } from '../../data/auth';
import { registerForPushNotifications } from '../../data/pushNotifications';
import TriRideTextLogo from '../../components/TriRideTextLogo';

// ── Validation helpers ────────────────────────────────────────
// [DEMO MODE] Relaxed — any username 3+ chars, email is auto-generated
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

const hasUppercase = (str) => /[A-Z]/.test(str);
const hasLowercase = (str) => /[a-z]/.test(str);
const hasNumber = (str) => /[0-9]/.test(str);

export default function RegisterScreen({ onLogin }) {
  const [role, setRole] = useState('student');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  // [DEMO MODE] Email is auto-generated — no email state needed
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Student specific
  const [studentId, setStudentId] = useState('');

  // Driver specific
  const [licenseNo, setLicenseNo] = useState('');
  const [plateNumber, setPlateNumber] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    // 1. Username — [DEMO MODE] just needs to be 3+ chars
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('Please choose a username.');
      return false;
    }
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return false;
    }

    // 2. Full Name
    if (!name.trim()) {
      setError('Please enter your full name.');
      return false;
    }

    // 3. Email is auto-generated — no validation needed

    // 4. Real Mobile Number
    const rawPhone = phone.trim().replace(/[\s\-()]/g, '');
    if (!rawPhone) {
      setError('Please enter your mobile number.');
      return false;
    }
    if (!PH_MOBILE_REGEX.test(rawPhone)) {
      setError('Please enter a valid Philippine mobile number (e.g. 09123456789 or +639123456789).');
      return false;
    }

    // 5. Standard Password
    if (!password) {
      setError('Please enter a password.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }
    if (!hasUppercase(password)) {
      setError('Password must contain at least one uppercase letter (A-Z).');
      return false;
    }
    if (!hasLowercase(password)) {
      setError('Password must contain at least one lowercase letter (a-z).');
      return false;
    }
    if (!hasNumber(password)) {
      setError('Password must contain at least one number (0-9).');
      return false;
    }

    // 6. Role Specific
    if (role === 'student') {
      if (!studentId.trim()) {
        setError('Please enter your Student ID.');
        return false;
      }
    } else if (role === 'driver') {
      if (!licenseNo.trim()) {
        setError("Please enter your Driver's License ID.");
        return false;
      }
      if (!plateNumber.trim()) {
        setError('Please enter your vehicle Plate Number.');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      // Check username availability
      const cleanUsername = username.trim().toLowerCase();
      const isAvailable = await checkUsernameAvailable(cleanUsername);
      if (!isAvailable) {
        setError('This username is already taken. Please choose a different username.');
        setLoading(false);
        return;
      }

      const rawPhone = phone.trim().replace(/[\s\-()]/g, '');

      // [DEMO MODE] Auto-generate email from username — user never enters one
      const autoEmail = `${cleanUsername}@triride.demo`;

      const result = await signUp({
        email: autoEmail,
        password,
        full_name: name.trim(),
        phone: rawPhone,
        role,
        username: cleanUsername,
        student_id: role === 'student' ? studentId.trim() : '',
        license_no: role === 'driver' ? licenseNo.trim() : '',
        plate_number: role === 'driver' ? plateNumber.trim() : '',
      });

      // Register push token immediately so approval notification reaches this device
      if (result?.user?.id) {
        registerForPushNotifications(result.user.id).catch(() => {});
      }

      setSubmitted(true);
    } catch (e) {
      const msg = e.message || 'Registration failed. Please try again.';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setError('This username is already registered. Please choose a different username.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={'padding'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.header}>
          <TriRideTextLogo size="medium" />
        </View>

        <View style={styles.main}>
          {submitted ? (
            <View style={[styles.card, SHADOWS.diffusion]}>
              <View style={styles.pendingContainer}>
                <View style={styles.pendingIconBg}>
                  <MaterialIcons name="hourglass-top" size={48} color={COLORS.tertiary} />
                </View>
                <Text style={styles.pendingTitle}>Registration Submitted</Text>
                <Text style={styles.pendingSubtitle}>
                  Your account is pending admin approval. You will be notified once an administrator verifies and approves your account.
                </Text>
                <TouchableOpacity style={styles.btnSubmit} activeOpacity={0.9} onPress={onLogin}>
                  <Text style={styles.btnSubmitText}>Back to Login</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.card, SHADOWS.diffusion]}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>Join the Community</Text>
                <Text style={styles.subtitle}>Your reliable campus transportation partner.</Text>
              </View>

              {/* Error Message */}
              {error ? (
                <View style={styles.errorContainer}>
                  <MaterialIcons name="error-outline" size={18} color={COLORS.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Role Selector */}
              <View style={styles.roleSelectorBg}>
                <TouchableOpacity
                  style={[
                    styles.roleBtn,
                    role === 'student' && styles.roleBtnActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setRole('student')}
                >
                  <MaterialIcons
                    name="school"
                    size={20}
                    color={role === 'student' ? COLORS.onPrimary : COLORS.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.roleBtnText,
                      role === 'student' && styles.roleBtnTextActive,
                    ]}
                  >
                    Student
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.roleBtn,
                    role === 'driver' && styles.roleBtnActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setRole('driver')}
                >
                  <MaterialIcons
                    name="directions-car"
                    size={20}
                    color={role === 'driver' ? COLORS.onPrimary : COLORS.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.roleBtnText,
                      role === 'driver' && styles.roleBtnTextActive,
                    ]}
                  >
                    Driver
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Registration Form */}
              <View style={styles.form}>
                {/* Username */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Username</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="alternate-email" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. juandelacruz"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      autoCapitalize="none"
                      value={username}
                      onChangeText={(text) => { setUsername(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* Full Name */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="person" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Juan Dela Cruz"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      value={name}
                      onChangeText={(text) => { setName(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* [DEMO MODE] Email field removed — auto-generated from username */}

                {/* Phone Number */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Mobile Number (Philippines)</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="call" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0912 345 6789"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={(text) => { setPhone(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* Student Specific Field */}
                {role === 'student' && (
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Student ID</Text>
                    <View style={styles.inputContainer}>
                      <MaterialIcons name="badge" size={20} color={COLORS.outline} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 2024-00123"
                        placeholderTextColor="rgba(115, 118, 134, 0.5)"
                        value={studentId}
                        onChangeText={(text) => { setStudentId(text); setError(''); }}
                      />
                    </View>
                  </View>
                )}

                {/* Driver Specific Fields */}
                {role === 'driver' && (
                  <>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Driver's License ID</Text>
                      <View style={styles.inputContainer}>
                        <MaterialIcons name="credit-card" size={20} color={COLORS.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. D01-23-456789"
                          placeholderTextColor="rgba(115, 118, 134, 0.5)"
                          autoCapitalize="characters"
                          value={licenseNo}
                          onChangeText={(text) => { setLicenseNo(text); setError(''); }}
                        />
                      </View>
                    </View>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>Vehicle Plate Number</Text>
                      <View style={styles.inputContainer}>
                        <MaterialIcons name="confirmation-number" size={20} color={COLORS.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. ABC 1234 or 1234-AB"
                          placeholderTextColor="rgba(115, 118, 134, 0.5)"
                          autoCapitalize="characters"
                          value={plateNumber}
                          onChangeText={(text) => { setPlateNumber(text); setError(''); }}
                        />
                      </View>
                    </View>
                  </>
                )}

                {/* Password */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Min. 8 chars (upper, lower, number)"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={password}
                      onChangeText={(text) => { setPassword(text); setError(''); }}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIconBtn}>
                      <MaterialIcons
                        name={showPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color={COLORS.outline}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Terms */}
                <Text style={styles.termsText}>
                  By creating an account, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>

                {/* Create Account CTA */}
                <TouchableOpacity
                  style={[styles.btnSubmit, loading && styles.btnSubmitDisabled]}
                  activeOpacity={0.9}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Text style={styles.btnSubmitText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
                  {!loading && <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />}
                </TouchableOpacity>
              </View>

              {/* Login Link */}
              <View style={styles.divider} />
              <View style={styles.loginRow}>
                <Text style={styles.loginLabel}>Already have an account?</Text>
                <TouchableOpacity onPress={onLogin}>
                  <Text style={styles.loginBtn}>Log in</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Footer Copyright */}
          <Text style={styles.copyrightText}>© 2026 TriRide Technologies Inc.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    marginTop: 20,
  },
  logoText: {
    ...TYPOGRAPHY.headlineLgMobile,
    color: COLORS.primary,
    fontWeight: '800',
  },
  main: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 24,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 400,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorContainer,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onErrorContainer,
    flex: 1,
  },
  roleSelectorBg: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainerLow,
    padding: 6,
    borderRadius: 16,
    marginBottom: SPACING.lg,
    gap: 4,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    borderRadius: 12,
  },
  roleBtnActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  roleBtnText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  roleBtnTextActive: {
    color: COLORS.onPrimary,
  },
  form: {
    gap: SPACING.md,
  },
  inputWrapper: {
    gap: SPACING.xs,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerLowest,
    height: 56,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
  },
  eyeIconBtn: {
    padding: SPACING.xs,
  },
  termsText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  btnSubmit: {
    height: 56,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    marginTop: SPACING.sm,
  },
  btnSubmitDisabled: {
    opacity: 0.7,
  },
  btnSubmitText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginVertical: SPACING.lg,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  loginLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
  },
  loginBtn: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
    fontWeight: '700',
  },
  copyrightText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.outline,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
  pendingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  pendingIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.tertiaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  pendingTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  pendingSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
});
