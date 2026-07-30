import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { signUp } from '../../data/auth';

export default function RegisterScreen({ onLogin }) {
  const [role, setRole] = useState('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!name.trim()) {
      setError('Please enter your full name.');
      return false;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return false;
    }
    if (!password) {
      setError('Please enter a password.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        full_name: name.trim(),
        phone: phone.trim(),
        role,
      });
      setSubmitted(true);
    } catch (e) {
      const msg = e.message || 'Registration failed. Please try again.';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setError('An account with this email already exists. Please try a different email or log in.');
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
          <Text style={styles.logoText}>TriRide</Text>
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
                  Your account is pending admin approval. You will be able to log in once an administrator reviews your registration.
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
                {/* Full Name */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="person" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="John Doe"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      value={name}
                      onChangeText={(text) => { setName(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* Email Address */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="mail" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="john@university.edu"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={(text) => { setEmail(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* Phone Number */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="call" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="+1 (555) 000-0000"
                      placeholderTextColor="rgba(115, 118, 134, 0.5)"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={(text) => { setPhone(text); setError(''); }}
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color={COLORS.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Min. 8 characters"
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
