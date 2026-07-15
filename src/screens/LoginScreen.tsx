import {ForgotPasswordModal} from '@components/modals/ForgotPasswordModal';
import { useAuthActions } from '@context/auth';
import { colors } from '@lib/ui/colors';
import { fonts } from '@lib/ui/typography';
import { APIException, flattenValidationErrors } from '@services/api';
import { useState } from 'react';
import {Pressable} from '@components/ui';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useLayout} from '@hooks/useLayout';
import IconChevronRight from '../assets/images/icon_chevron_right.svg';
import LoginSignupArt from '../assets/images/login_signup.svg';
import GumpLogo from '../assets/images/logo.svg';

export default function LoginScreen() {
  const { login } = useAuthActions();
  const { isDesktopLayout } = useLayout();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | null>(null);

  const isFormValid = email.trim() && password.trim();

  const handleLogin = async () => {
    if (!isFormValid) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(email.trim(), password.trim());
    } catch (err) {
      if (err instanceof APIException) {
        const validationErrors = flattenValidationErrors(err.details);
        setError(
          validationErrors.length > 0 ? validationErrors[0] : err.message,
        );
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formFields = (
    <View style={styles.formBody}>
      <Text style={styles.heading}>Welcome Back</Text>

      <View style={styles.inputTable}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View
          style={[styles.inputRow, !isDesktopLayout && styles.inputRowStacked]}
        >
          <Text
            style={[
              styles.fieldLabel,
              !isDesktopLayout && styles.fieldLabelStacked,
            ]}
          >
            Email
          </Text>
          <TextInput
            style={[
              styles.input,
              focusedField !== 'email' && email && styles.inputFilled,
              !isDesktopLayout && styles.inputStacked,
            ]}
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textPlaceholder}
            enableFocusRing={false}
            onFocus={() => setFocusedField('email')}
            onBlur={() =>
              setFocusedField(current => (current === 'email' ? null : current))
            }
          />
        </View>

        <View
          style={[styles.inputRow, !isDesktopLayout && styles.inputRowStacked]}
        >
          <Text
            style={[
              styles.fieldLabel,
              !isDesktopLayout && styles.fieldLabelStacked,
            ]}
          >
            Password
          </Text>
          <TextInput
            style={[
              styles.input,
              !isDesktopLayout && styles.inputStacked,
            ]}
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
            secureTextEntry
            onSubmitEditing={handleLogin}
            placeholderTextColor={colors.textPlaceholder}
            enableFocusRing={false}
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable
          onPress={() => setShowForgotPasswordModal(true)}
          hitSlop={8}>
          <Text style={styles.forgotPassword}>Forgot Your Password?</Text>
        </Pressable>

        <Pressable
          style={[
            styles.loginButton,
            (isLoading || !isFormValid) && styles.loginButtonDisabled,
            isLoading && styles.loginButtonLoading,
          ]}
          onPress={handleLogin}
          disabled={isLoading || !isFormValid}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <View style={styles.loginButtonContent}>
              <Text style={styles.loginButtonText}>Log In</Text>
              <IconChevronRight style={styles.loginButtonIcon} />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );

  const forgotPasswordModal = (
    <ForgotPasswordModal
      visible={showForgotPasswordModal}
      onClose={() => setShowForgotPasswordModal(false)}
    />
  );

  if (isDesktopLayout) {
    return (
      <>
        <View style={styles.container}>
          <View style={styles.leftHalf}>
            <View style={styles.artFrame}>
              <LoginSignupArt
                width="100%"
                height="100%"
                preserveAspectRatio="xMinYMax meet"
              />
            </View>
          </View>

          <View style={styles.rightHalf}>
            <View style={styles.formPanel}>
              <GumpLogo width={115} height={40} />
              {formFields}
              <View />
            </View>
          </View>
        </View>
        {forgotPasswordModal}
      </>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.stackedScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoHeaderStacked}>
          <GumpLogo width={115} height={40} />
        </View>

        <View style={styles.artFrameStacked}>
          <LoginSignupArt
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          />
        </View>

        <View style={styles.formColumnStacked}>{formFields}</View>
      </ScrollView>
      {forgotPasswordModal}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },

  leftHalf: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  artFrame: {
    width: '100%',
    aspectRatio: 720 / 586,
  },

  rightHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  formPanel: {
    width: '100%',
    maxWidth: 540,
    gap: 100,
  },
  formBody: {
    gap: 32,
  },
  heading: {
    fontSize: 42,
    lineHeight: 42 * 1.2,
    color: colors.text,
    fontFamily: fonts.serif,
    textTransform: 'capitalize',
  },

  inputTable: {
    width: '100%',
    gap: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  fieldLabel: {
    width: 180,
    color: colors.text,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    fontFamily: fonts.sans,
    textTransform: 'capitalize',
  },
  fieldLabelStacked: {
    width: 'auto',
  },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: 20,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  inputFilled: {
    paddingTop: 12,
    lineHeight: 18,
  },
  inputStacked: {
    width: '100%',
    maxWidth: '100%',
  },

  logoHeaderStacked: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  artFrameStacked: {
    width: '100%',
    aspectRatio: 691 / 562,
    maxHeight: 280,
    paddingHorizontal: 24,
    marginBottom: 32,
  },

  stackedScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  formColumnStacked: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  forgotPassword: {
    color: colors.link,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    fontFamily: fonts.sans,
  },
  loginButton: {
    height: 42,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingRight: 16,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.2,
  },
  loginButtonLoading: {
    paddingRight: 24,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fonts.sansBold,
    textTransform: 'capitalize',
    includeFontPadding: false,
  },
  loginButtonIcon: {
    width: 24,
    height: 24,
    color: colors.text,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.sans,
  },
});
