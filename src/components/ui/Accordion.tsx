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
  const heightProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(heightProgress, {
      toValue: expanded ? 1 : 0,
      duration: ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, heightProgress]);

  const hasMeasurement = measuredHeight > 0;

  const animatedHeight = heightProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, measuredHeight],
  });

  const handleContentLayout = (height: number) => {
    if (hasMeasurement) return;
    setMeasuredHeight(height);
  };

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
        <View
          style={[
            styles.chevron,
            {transform: [{rotate: expanded ? '0deg' : '180deg'}]},
          ]}>
          <IconChevronUp width={24} height={24} color={colors.textGray} />
        </View>
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
