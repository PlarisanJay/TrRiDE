import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { alertDialog } from '../../lib/dialog';
import { signIn, resetPassword } from '../../data/auth';
import TriRideTextLogo from '../../components/TriRideTextLogo';

export default function LoginScreen({ onLoginSuccess, onSignUp }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!identifier.trim()) {
      setError('Please enter your username, mobile number, or Gmail above, then tap Forgot Password.');
      return;
    }
    try {
      const targetEmail = await resetPassword(identifier.trim());
      alertDialog({
        title: 'Check Your Gmail',
        message: `A password reset confirmation link has been sent to your registered Gmail address: ${targetEmail}`,
      });
    } catch (e) {
      setError(e.message || 'Failed to send reset email. Please try again.');
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your username or Gmail address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const { profile } = await signIn({ identifier: identifier.trim(), password });
      onLoginSuccess(profile.role, profile);
    } catch (e) {
      const msg = e.message || 'Login failed. Please try again.';
      // Map Supabase generic errors to user-friendly messages
      if (msg.includes('Invalid login credentials')) {
        setError('Invalid credentials. Please check your username/Gmail and password and try again.');
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
        {/* Top Logo */}
        <View style={styles.header}>
          <TriRideTextLogo size="medium" />
        </View>

        <View style={styles.main}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Login to your TriRide account</Text>

          {/* Form Card */}
          <View style={[styles.card, SHADOWS.diffusion]}>
            {/* Error Message */}
            {error ? (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={18} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Username / Gmail Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Username or Gmail</Text>
              <View style={styles.inputContainer}>
                <MaterialIcons name="person-outline" size={20} color={COLORS.outline} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. jdoe or jdoe@gmail.com"
                  placeholderTextColor="rgba(115, 118, 134, 0.5)"
                  autoCapitalize="none"
                  value={identifier}
                  onChangeText={(text) => { setIdentifier(text); setError(''); }}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputWrapper}>
              <View style={styles.passwordHeader}>
                <Text style={styles.inputLabel}>Password</Text>
                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={COLORS.outline} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
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

            {/* Log In Button */}
            <TouchableOpacity
              style={[styles.btnSubmit, loading && styles.btnSubmitDisabled]}
              activeOpacity={0.9}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.btnSubmitText}>{loading ? 'Logging in...' : 'Log In'}</Text>
              {!loading && <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />}
            </TouchableOpacity>
          </View>

          {/* Footer Navigation to SignUp */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={onSignUp}>
              <Text style={styles.signUpLinkText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
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
  },
  logoText: {
    ...TYPOGRAPHY.headlineLgMobile,
    color: COLORS.primary,
    fontWeight: '800',
  },
  main: {
    width: '100%',
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
    marginBottom: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.lg,
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
  inputWrapper: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  forgotText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.surfaceBright,
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
  btnSubmit: {
    height: 56,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: ROUNDED.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  btnSubmitDisabled: {
    opacity: 0.7,
  },
  btnSubmitText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.xs,
  },
  footerText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
  },
  signUpLinkText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
