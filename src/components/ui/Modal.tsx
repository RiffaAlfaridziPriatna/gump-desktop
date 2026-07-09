import {colors} from '@lib/ui/colors';
import {isDesktopPlatform} from '@lib/system/platform';
import {ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Modal as RNModal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import {TouchableOpacity} from './TouchableOpacity';
import IconClose from '../../assets/images/icon_close.svg';

const useNativeDriver = Platform.OS !== 'windows';

export type ModalDecorativeProps = {
  width?: string | number;
  height?: number;
  preserveAspectRatio?: string;
};

const ENTER_DURATION = 360;
const EXIT_DURATION = 280;
const FALLBACK_CARD_HEIGHT = 360;

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  width?: number;
  height?: number;
  children: ReactNode;
  decorative?: React.ComponentType<ModalDecorativeProps>;
  decorativeHeight?: number;
  showCloseButton?: boolean;
  contentStyle?: ViewStyle;
};

type ModalCardProps = Omit<ModalProps, 'visible'>;

function ModalCard({
  onClose,
  width = 380,
  height,
  children,
  decorative: Decorative,
  decorativeHeight = 100,
  showCloseButton = true,
  contentStyle,
  cardStyle,
  onCardLayout,
  CardWrapper = View,
}: ModalCardProps & {
  cardStyle?: ViewStyle;
  onCardLayout?: (height: number) => void;
  CardWrapper?: typeof View | typeof Animated.View;
}) {
  return (
    <CardWrapper
      style={[styles.card, {width, height}, cardStyle]}
      onLayout={
        onCardLayout
          ? event => onCardLayout(event.nativeEvent.layout.height)
          : undefined
      }>
      {showCloseButton && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <IconClose width={20} height={20} color={colors.textDark} />
        </TouchableOpacity>
      )}
      <View
        style={[
          styles.content,
          height != null && styles.contentFlex,
          contentStyle,
        ]}>
        {children}
      </View>
      {Decorative && (
        <View style={[styles.decorative, {height: decorativeHeight}]}>
          <Decorative
            width="100%"
            height={decorativeHeight}
            preserveAspectRatio="xMidYMax slice"
          />
        </View>
      )}
    </CardWrapper>
  );
}

function ModalContent(props: ModalCardProps) {
  const {onClose} = props;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback>
          <ModalCard {...props} />
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

function DesktopModal(props: ModalProps) {
  const {visible, onClose} = props;
  const {height: windowHeight} = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [cardHeight, setCardHeight] = useState(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const slideOffset = useMemo(() => {
    const height = Math.max(cardHeight, FALLBACK_CARD_HEIGHT);
    return windowHeight / 2 + height / 2 + 32;
  }, [windowHeight, cardHeight]);
  const slideOffsetRef = useRef(slideOffset);
  slideOffsetRef.current = slideOffset;

  useEffect(() => {
    overlayOpacity.stopAnimation();
    translateY.stopAnimation();
    const offset = slideOffsetRef.current;

    if (visible) {
      setMounted(true);
      overlayOpacity.setValue(0);
      translateY.setValue(offset);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
        }),
      ]).start();

      return;
    }

    if (!mounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: EXIT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: offset,
        duration: EXIT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver,
      }),
    ]).start(({finished}) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [visible, mounted, overlayOpacity, translateY]);

  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, {opacity: overlayOpacity}]}
          />
          <TouchableWithoutFeedback>
            <ModalCard
              {...props}
              CardWrapper={Animated.View}
              cardStyle={{transform: [{translateY}]}}
              onCardLayout={setCardHeight}
            />
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

export function Modal(props: ModalProps) {
  if (isDesktopPlatform()) {
    return <DesktopModal {...props} />;
  }

  const {visible, onClose, ...contentProps} = props;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <ModalContent onClose={onClose} {...contentProps} />
    </RNModal>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalOverlay,
  },
  card: {
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  contentFlex: {
    flex: 1,
  },
  decorative: {
    overflow: 'hidden',
  },
});
