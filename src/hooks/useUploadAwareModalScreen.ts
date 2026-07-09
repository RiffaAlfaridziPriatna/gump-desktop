import type {ModalSlideEnterHandle} from '@components/navigation/ModalSlideEnter';
import type {UploadAwareModalShellProps} from '@components/navigation/UploadAwareModalShell';
import {
  beginUploadNavigationCoop,
  endUploadNavigationCoop,
  prioritizeNavigationInteraction,
  usesCustomModalEnterAnimation,
} from '@lib/navigation/uploadAwareNavigation';
import type {ParamListBase} from '@react-navigation/native';
import {useIsFocused} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {useCallback, useEffect, useRef} from 'react';

export function useUploadAwareModalScreen<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList & string,
>(
  navigation: StackNavigationProp<ParamList, RouteName>,
  instant?: boolean,
) {
  const isFocused = useIsFocused();
  const customEnterAnimation = usesCustomModalEnterAnimation();
  const slideRef = useRef<ModalSlideEnterHandle | null>(null);
  const closingRef = useRef(false);

  const onEnterAnimationEnd = useCallback(() => {
    if (customEnterAnimation) {
      endUploadNavigationCoop();
    }
  }, [customEnterAnimation]);

  useEffect(() => {
    if (instant || customEnterAnimation) {
      return;
    }

    const onTransitionEnd = (event: {data: {closing: boolean}}) => {
      if (!event.data.closing) {
        endUploadNavigationCoop();
      }
    };

    return navigation.addListener('transitionEnd', onTransitionEnd);
  }, [customEnterAnimation, instant, navigation]);

  useEffect(() => {
    if (!instant || !isFocused) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      endUploadNavigationCoop();
    });

    return () => cancelAnimationFrame(frame);
  }, [instant, isFocused]);

  const handleBackPressIn = useCallback(() => {
    prioritizeNavigationInteraction();
    beginUploadNavigationCoop();
  }, []);

  const handleBack = useCallback(() => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;

    const finishBack = () => {
      navigation.goBack();
      endUploadNavigationCoop();
    };

    if (!customEnterAnimation || instant || !slideRef.current) {
      finishBack();
      return;
    }

    slideRef.current.slideOut(finishBack);
  }, [customEnterAnimation, instant, navigation]);

  const shellProps: UploadAwareModalShellProps = {
    slideRef,
    enabled: customEnterAnimation,
    instant,
    onEnterComplete: onEnterAnimationEnd,
  };

  return {shellProps, handleBack, handleBackPressIn};
}
