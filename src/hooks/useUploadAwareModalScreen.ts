import type {ModalSlideEnterHandle} from '@components/navigation/ModalSlideEnter';
import type {UploadAwareModalShellProps} from '@components/navigation/UploadAwareModalShell';
import {
  hasActiveQueueWork,
  hasActiveQueueWorkForAlbum,
} from '@lib/culledAlbum/uploadQueueStore';
import {cancelScrollImagePreload} from '@lib/media/scrollImagePreload';
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

export type UploadAwareModalScreenResult = {
  shellProps: UploadAwareModalShellProps;
  handleBack: () => void;
  handleBackPressIn: () => void;
};

export function useUploadAwareModalScreen<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList & string,
>(
  navigation: StackNavigationProp<ParamList, RouteName>,
  instant?: boolean,
  options?: {albumId?: string},
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

  const finishBack = useCallback(() => {
    navigation.goBack();
    endUploadNavigationCoop();
  }, [navigation]);

  const startSlideOut = useCallback(() => {
    if (!customEnterAnimation || instant || !slideRef.current) {
      finishBack();
      return;
    }

    slideRef.current.slideOut(finishBack);
  }, [customEnterAnimation, finishBack, instant]);

  const needsUploadNavigationCoop = useCallback(() => {
    const albumId = options?.albumId;
    if (albumId && hasActiveQueueWorkForAlbum(albumId)) {
      return true;
    }
    return hasActiveQueueWork();
  }, [options?.albumId]);

  const prepareBackNavigation = useCallback(() => {
    if (closingRef.current) {
      return false;
    }

    closingRef.current = true;
    cancelScrollImagePreload();

    const needsCoop = needsUploadNavigationCoop();
    if (needsCoop) {
      prioritizeNavigationInteraction();
      beginUploadNavigationCoop();
    }

    return true;
  }, [needsUploadNavigationCoop]);

  const handleBackPressIn = useCallback(() => {
    if (!prepareBackNavigation()) {
      return;
    }

    startSlideOut();
  }, [prepareBackNavigation, startSlideOut]);

  const handleBack = useCallback(() => {
    if (!prepareBackNavigation()) {
      return;
    }

    startSlideOut();
  }, [prepareBackNavigation, startSlideOut]);

  const shellProps: UploadAwareModalShellProps = {
    slideRef,
    enabled: customEnterAnimation,
    instant,
    onEnterComplete: onEnterAnimationEnd,
  };

  return {shellProps, handleBack, handleBackPressIn};
}
