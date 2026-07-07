import {endUploadNavigationCoop} from '@lib/navigation/uploadAwareNavigation';
import type {ParamListBase} from '@react-navigation/native';
import {useIsFocused} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {useEffect} from 'react';

export function useUploadAwareModalScreen<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList & string,
>(
  navigation: StackNavigationProp<ParamList, RouteName>,
  instant?: boolean,
): void {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (instant) {
      return;
    }

    const onTransitionEnd = (event: {data: {closing: boolean}}) => {
      if (!event.data.closing) {
        endUploadNavigationCoop();
      }
    };

    return navigation.addListener('transitionEnd', onTransitionEnd);
  }, [instant, navigation]);

  useEffect(() => {
    if (!instant || !isFocused) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      endUploadNavigationCoop();
    });

    return () => cancelAnimationFrame(frame);
  }, [instant, isFocused]);
}
