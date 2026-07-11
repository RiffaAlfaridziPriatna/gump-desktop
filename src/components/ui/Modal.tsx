import {useModalViewport} from '@hooks/useModalViewport';
import {colors} from '@lib/ui/colors';
import {MODAL_OVERLAY_PADDING, ModalDesignSize} from '@lib/ui/modalDimensions';
import {isDesktopPlatform} from '@lib/system/platform';
import {ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Modal as RNModal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
  StyleProp,
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
type ModalBodyCardProps = Omit<ModalCardProps, 'onClose'>;

function toModalDesign(props: ModalBodyCardProps): ModalDesignSize {
  return {
    width: props.width,
    height: props.height,
    decorativeHeight: props.decorativeHeight,
  };
}

function ModalOverlay({
  onClose,
  onLayout,
  backdrop,
  children,
}: {
  onClose: () => void;
  onLayout: ReturnType<typeof useModalViewport>['onOverlayLayout'];
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay} onLayout={onLayout}>
        {backdrop}
        <TouchableWithoutFeedback>{children}</TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

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
  CardWrapper = View,
}: ModalCardProps & {
  cardStyle?: StyleProp<ViewStyle>;
  CardWrapper?: typeof View | typeof Animated.View;
}) {
  return (
    <CardWrapper style={[styles.card, {width, height}, cardStyle]}>
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

function ModalBody({
  onClose,
  cardProps,
  viewport,
  CardWrapper = View,
  cardStyle,
  backdrop,
}: {
  onClose: () => void;
  cardProps: ModalBodyCardProps;
  viewport: ReturnType<typeof useModalViewport>;
  CardWrapper?: typeof View | typeof Animated.View;
  cardStyle?: StyleProp<ViewStyle>;
  backdrop?: ReactNode;
}) {
  const {onOverlayLayout, resolved, isLayoutReady} = viewport;

  return (
    <ModalOverlay
      onClose={onClose}
      onLayout={onOverlayLayout}
      backdrop={backdrop}>
      <ModalCard
        {...cardProps}
        onClose={onClose}
        width={resolved.width}
        height={resolved.height}
        decorativeHeight={resolved.decorativeHeight ?? cardProps.decorativeHeight}
        CardWrapper={CardWrapper}
        cardStyle={[
          cardStyle,
          !isLayoutReady ? styles.cardHidden : undefined,
        ]}
      />
    </ModalOverlay>
  );
}

function useDesktopModalTransition(
  visible: boolean,
  canAnimateIn: boolean,
  slideOffset: number,
  mounted: boolean,
  setMounted: (value: boolean) => void,
) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const slideOffsetRef = useRef(slideOffset);
  const hasEnteredRef = useRef(false);
  slideOffsetRef.current = slideOffset;

  useEffect(() => {
    if (!visible) {
      hasEnteredRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    overlayOpacity.stopAnimation();
    translateY.stopAnimation();
    const offset = slideOffsetRef.current;

    if (visible) {
      setMounted(true);

      if (!canAnimateIn || hasEnteredRef.current) {
        if (!hasEnteredRef.current) {
          overlayOpacity.setValue(0);
          translateY.setValue(offset);
        }
        return;
      }

      hasEnteredRef.current = true;
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
  }, [
    visible,
    mounted,
    canAnimateIn,
    overlayOpacity,
    translateY,
    setMounted,
  ]);

  return {overlayOpacity, translateY};
}

function DesktopModal(props: ModalProps) {
  const {visible, onClose, ...cardProps} = props;
  const design = toModalDesign(cardProps);
  const [mounted, setMounted] = useState(visible);
  const measureActive = visible || mounted;
  const viewport = useModalViewport(measureActive, design);
  const {resolved, viewportHeight, isLayoutReady} = viewport;
  const canAnimateIn = isLayoutReady;

  const slideOffset = useMemo(() => {
    const height = resolved.height ?? FALLBACK_CARD_HEIGHT;
    return viewportHeight / 2 + height / 2 + 32;
  }, [viewportHeight, resolved.height]);

  const {overlayOpacity, translateY} = useDesktopModalTransition(
    visible,
    canAnimateIn,
    slideOffset,
    mounted,
    setMounted,
  );

  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="box-none">
      <ModalBody
        onClose={onClose}
        cardProps={cardProps}
        viewport={viewport}
        CardWrapper={Animated.View}
        cardStyle={{transform: [{translateY}]}}
        backdrop={
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, {opacity: overlayOpacity}]}
          />
        }
      />
    </View>
  );
}

function MobileModal(props: ModalProps) {
  const {visible, onClose, ...cardProps} = props;
  const viewport = useModalViewport(visible, toModalDesign(cardProps));

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <ModalBody onClose={onClose} cardProps={cardProps} viewport={viewport} />
    </RNModal>
  );
}

export function Modal(props: ModalProps) {
  if (isDesktopPlatform()) {
    return <DesktopModal {...props} />;
  }

  return <MobileModal {...props} />;
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
    padding: MODAL_OVERLAY_PADDING,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalOverlay,
  },
  card: {
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  cardHidden: {
    opacity: 0,
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
    minHeight: 0,
  },
  decorative: {
    overflow: 'hidden',
  },
});
