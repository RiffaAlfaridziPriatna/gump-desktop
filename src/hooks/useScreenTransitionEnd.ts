import type {ParamListBase} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {useEffect, useState} from 'react';

const TRANSITION_FALLBACK_MS = 450;

export function useScreenTransitionEnd<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList & string,
>(navigation: StackNavigationProp<ParamList, RouteName>): boolean {
  const [transitionEnded, setTransitionEnded] = useState(false);

  useEffect(() => {
    setTransitionEnded(false);

    const onTransitionEnd = (event: {data: {closing: boolean}}) => {
      if (!event.data.closing) {
        setTransitionEnded(true);
      }
    };

    const unsubscribeEnd = navigation.addListener(
      'transitionEnd',
      onTransitionEnd,
    );

    const fallbackTimer = setTimeout(() => {
      setTransitionEnded(true);
    }, TRANSITION_FALLBACK_MS);

    return () => {
      unsubscribeEnd();
      clearTimeout(fallbackTimer);
    };
  }, [navigation]);

  return transitionEnded;
}
