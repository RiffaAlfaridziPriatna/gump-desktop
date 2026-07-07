import {hasAnyInFlightAlbumWork} from '@lib/culledAlbum/store';
import {
  StackNavigationOptions,
  TransitionPresets,
} from '@react-navigation/stack';
import {Platform} from 'react-native';
import {beginUploadNavigationCoop} from './uploadNavigationCoop';

export type InstantNavParams = {
  instant?: boolean;
};

export type WithInstantNav<T> = T & InstantNavParams;

export {
  endUploadNavigationCoop,
  isUploadNavigationActive,
  runDeferredDuringUploadNavigation,
} from './uploadNavigationCoop';

function shouldUseInstantStackNavigation(): boolean {
  return !usesCustomModalEnterAnimation();
}

export function uploadAwareParams<T extends object>(params: T): T & InstantNavParams {
  if (!hasAnyInFlightAlbumWork()) {
    return params;
  }

  beginUploadNavigationCoop();

  if (shouldUseInstantStackNavigation()) {
    return {...params, instant: true};
  }

  return params;
}

export function uploadAwareRouteParams(): InstantNavParams | undefined {
  if (!hasAnyInFlightAlbumWork()) {
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
  // RNW does not reliably run ModalSlideEnter transform animations with the
  // native driver, which leaves modal screens off-screen on Windows.
  return Platform.OS === 'macos';
}

export function uploadAwareModalScreenOptions({
  route,
}: {
  route: {params?: InstantNavParams};
}): StackNavigationOptions {
  if (Platform.OS === 'windows') {
    return {
      animation: 'none',
      gestureEnabled: true,
    };
  }

  if (usesCustomModalEnterAnimation()) {
    return {
      animation: 'none',
      gestureEnabled: true,
      cardStyle: {backgroundColor: 'transparent'},
      cardOverlayEnabled: false,
    };
  }

  if (route.params?.instant) {
    return {
      animation: 'none',
      gestureEnabled: true,
    };
  }

  return modalSlideOptions;
}

export const modalSlideFromBottomOptions = modalSlideOptions;
