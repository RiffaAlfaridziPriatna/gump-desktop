import {hasActiveQueueWork} from '@lib/culledAlbum/uploadQueueStore';
import {isDesktopPlatform} from '@lib/system/platform';
import {
  StackNavigationOptions,
  TransitionPresets,
} from '@react-navigation/stack';
import {beginUploadNavigationCoop} from './uploadNavigationCoop';

export type InstantNavParams = {
  instant?: boolean;
};

export type WithInstantNav<T> = T & InstantNavParams;

export {
  beginUploadNavigationCoop,
  clearNavigationInteractionPriority,
  endUploadNavigationCoop,
  isUploadNavigationActive,
  onUploadNavigationCoopEnd,
  prioritizeNavigationInteraction,
  runDeferredDuringUploadNavigation,
  runOrDeferHeavyWorkForNavigation,
  shouldDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from './uploadNavigationCoop';

function shouldUseInstantStackNavigation(): boolean {
  return !usesCustomModalEnterAnimation();
}

export function uploadAwareParams<T extends object>(params: T): T & InstantNavParams {
  if (!hasActiveQueueWork()) {
    return params;
  }

  beginUploadNavigationCoop();

  if (shouldUseInstantStackNavigation()) {
    return {...params, instant: true};
  }

  return params;
}

export function uploadAwareRouteParams(): InstantNavParams | undefined {
  if (!hasActiveQueueWork()) {
    return undefined;
  }

  beginUploadNavigationCoop();

  if (shouldUseInstantStackNavigation()) {
    return {instant: true};
  }

  return undefined;
}

const modalSlideOptions: StackNavigationOptions = {
  animation: 'slide_from_bottom',
  ...TransitionPresets.ModalSlideFromBottomIOS,
  cardOverlayEnabled: true,
  gestureEnabled: true,
};

export function usesCustomModalEnterAnimation(): boolean {
  return isDesktopPlatform();
}

export function uploadAwareModalScreenOptions({
  route,
}: {
  route: {params?: InstantNavParams | Record<string, unknown> | undefined};
}): StackNavigationOptions {
  if (usesCustomModalEnterAnimation()) {
    return {
      animation: 'none',
      gestureEnabled: true,
      presentation: 'transparentModal',
      cardStyle: {backgroundColor: 'transparent'},
      cardOverlayEnabled: false,
      detachPreviousScreen: false,
    };
  }

  const params = route.params as InstantNavParams | undefined;
  if (params?.instant) {
    return {
      animation: 'none',
      gestureEnabled: true,
    };
  }

  return modalSlideOptions;
}

export const modalSlideFromBottomOptions = modalSlideOptions;
