import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {ReactNode, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {Pressable} from './Pressable';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';

const ANIMATION_DURATION_MS = 300;

type AccordionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  fill?: boolean;
  minContentHeight?: number;
  style?: ViewStyle;
};

type ChevronDirection = 'up' | 'down';

export function Accordion({
  title,
  expanded,
  onToggle,
  children,
  fill = false,
  minContentHeight = 200,
  style,
}: AccordionProps) {
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const [chevronDirection, setChevronDirection] = useState<ChevronDirection>(
    expanded ? 'up' : 'down',
  );
  const [isChevronAnimating, setIsChevronAnimating] = useState(false);
  const heightProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const chevronProgress = useRef(new Animated.Value(0)).current;
  const prevExpandedRef = useRef(expanded);
  const hasMountedRef = useRef(false);
  const chevronAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.timing(heightProgress, {
      toValue: expanded ? 1 : 0,
      duration: ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, heightProgress]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevExpandedRef.current = expanded;
      setChevronDirection(expanded ? 'up' : 'down');
      setIsChevronAnimating(false);
      chevronProgress.setValue(0);
      return;
    }

    if (prevExpandedRef.current === expanded) {
      return;
    }
    prevExpandedRef.current = expanded;

    // Animate from the leaving icon, then settle on the target icon with no transform.
    // Steady-state SVG+rotate is what blanks the chevron when tooltips remount nearby.
    setChevronDirection(expanded ? 'down' : 'up');
    setIsChevronAnimating(true);
    chevronProgress.setValue(0);
    chevronAnimationRef.current?.stop();

    const animation = Animated.timing(chevronProgress, {
      toValue: 1,
      duration: ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    chevronAnimationRef.current = animation;
    animation.start(({finished}) => {
      if (!finished) {
        return;
      }
      setChevronDirection(expanded ? 'up' : 'down');
      setIsChevronAnimating(false);
      chevronProgress.setValue(0);
    });

    return () => {
      animation.stop();
    };
  }, [expanded, chevronProgress]);

  const hasMeasurement = measuredHeight > 0;

  const animatedHeight = heightProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, measuredHeight],
  });

  const chevronRotation = chevronProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const handleContentLayout = (height: number) => {
    if (hasMeasurement) return;
    setMeasuredHeight(height);
  };

  const ChevronIcon =
    chevronDirection === 'up' ? IconChevronUp : IconChevronDown;

  return (
    <View
      style={[
        styles.container,
        fill && expanded && styles.fillContainer,
        style,
      ]}>
      <Pressable
        onPress={onToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{expanded}}>
        <Animated.View
          style={[
            styles.chevron,
            isChevronAnimating ? {transform: [{rotate: chevronRotation}]} : null,
          ]}>
          <ChevronIcon width={24} height={24} color={colors.textGray} />
        </Animated.View>
        <Text style={styles.title}>{title}</Text>
      </Pressable>

      {fill ? (
        expanded && (
          <View
            style={[styles.fillContent, {minHeight: minContentHeight}]}>
            {children}
          </View>
        )
      ) : (
        <>
          {!hasMeasurement && !expanded && (
            <View
              style={styles.measureLayer}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants">
              <View
                style={styles.contentMeasure}
                onLayout={event =>
                  handleContentLayout(event.nativeEvent.layout.height)
                }>
                {children}
              </View>
            </View>
          )}
          <Animated.View
            style={[
              styles.animatedContent,
              hasMeasurement
                ? {height: animatedHeight}
                : expanded
                  ? undefined
                  : {height: 0},
            ]}
            pointerEvents={expanded ? 'auto' : 'none'}>
            {(hasMeasurement || expanded) && (
              <View
                style={styles.contentMeasure}
                onLayout={event =>
                  handleContentLayout(event.nativeEvent.layout.height)
                }>
                {children}
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fillContainer: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 2,
  },
  chevron: {
    width: 24,
    height: 24,
  },
  title: {
    flex: 1,
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.text,
  },
  animatedContent: {
    overflow: 'hidden',
  },
  measureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
  },
  contentMeasure: {
    paddingTop: 16,
    gap: 8,
  },
  fillContent: {
    flex: 1,
    minHeight: 0,
    marginTop: 16,
  },
});
