import {Modal, TouchableOpacity} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {make} from '@di/tsyringe';
import {fonts} from '@lib/ui/typography';
import {APIException, APIService, flattenValidationErrors} from '@services/api';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';

const isWindows = Platform.OS === 'windows';

type ForgotPasswordModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ForgotPasswordModal({
  visible,
  onClose,
}: ForgotPasswordModalProps) {
  const inputRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailFocused, setIsEmailFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail('');
      setError(null);
      setSubmitting(false);
      setIsEmailFocused(false);

      const focusTimer = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(focusTimer);
    }
  }, [visible]);

  async function handleReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email');
      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const success = await make(APIService).auth.forgotPassword(trimmedEmail);
      if (success) {
        onClose();
        return;
      }
      setError('Unable to send reset email. Please try again.');
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
      setSubmitting(false);
    }
  }

  const isFormValid = email.trim().length > 0;

  const syncEmailCursorColor = useCallback(() => {
    inputRef.current?.setNativeProps({cursorColor: colors.textDark});
  }, []);

  function handleEmailFocus() {
    setIsEmailFocused(true);
    syncEmailCursorColor();
    requestAnimationFrame(syncEmailCursorColor);
  }

  useEffect(() => {
    if (!visible || !isEmailFocused) {
      return;
    }

    syncEmailCursorColor();
  }, [visible, isEmailFocused, syncEmailCursorColor]);

  return (
    <Modal visible={visible} onClose={onClose} width={780} height={320}>
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />

      <View style={styles.content}>
        <Text style={styles.title}>Forgot Your Password?</Text>
        <Text style={styles.message}>
          To reset your password, please input your email below. We&apos;ll
          send you an email with instructions to follow.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.inputGroup}>
          <View style={styles.inputShell}>
            <TextInput
              ref={inputRef}
              style={[
                styles.emailInput,
                !isWindows &&
                  !isEmailFocused &&
                  email &&
                  styles.emailInputFilled,
              ]}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.textPlaceholder}
              enableFocusRing={false}
              cursorColor={colors.textDark}
              selectionColor={colors.link}
              onFocus={handleEmailFocus}
              onBlur={() =>
                setIsEmailFocused(current => (current ? false : current))
              }
              onSubmitEditing={handleReset}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.resetButton,
              !isFormValid || submitting
                ? styles.resetButtonDisabled
                : styles.resetButtonEnabled,
            ]}
            onPress={handleReset}
            disabled={!isFormValid || submitting}
            activeOpacity={0.8}>
            {submitting ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.resetButtonText}>Reset</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
    width: '100%',
    paddingHorizontal: 110,
    paddingTop: 60,
    paddingBottom: 70,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 33,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 21,
    color: colors.textDark,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.error,
    textAlign: 'center',
    maxWidth: 480,
  },
  inputGroup: {
    width: '100%',
    height: 48,
    position: 'relative',
    alignSelf: 'center',
  },
  inputShell: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.textGray,
    borderRadius: 24,
    paddingLeft: isWindows ? 20 : 0,
    paddingRight: 72,
    ...(isWindows ? {} : {justifyContent: 'center' as const}),
  },
  emailInput: {
    ...(isWindows
      ? {
          position: 'absolute' as const,
          left: 20,
          right: 72,
          top: 2,
          height: 36,
          padding: 0,
          margin: 0,
          lineHeight: 22,
        }
      : {
          height: 42,
          lineHeight: 20,
          paddingVertical: 10,
          paddingLeft: 20,
          paddingRight: 8,
        }),
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
    backgroundColor: 'transparent',
  },
  emailInputFilled: {
    paddingTop: 12,
    lineHeight: 18,
  },
  resetButton: {
    position: 'absolute',
    right: -40,
    top: 0,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 28,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  resetButtonEnabled: {
    backgroundColor: colors.accent,
  },
  resetButtonDisabled: {
    backgroundColor: '#FFCC99',
  },
  resetButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
