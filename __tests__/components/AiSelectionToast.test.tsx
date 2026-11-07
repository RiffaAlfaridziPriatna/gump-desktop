import React from 'react';
import { Pressable } from '../../src/components/ui';
import { AccessibilityInfo, Text } from 'react-native';
import { act } from 'react-test-renderer';
import { AiSelectionToast } from '../../src/components/culling/AiSelectionToast';
import { press, render } from '../helpers/render';

type Props = React.ComponentProps<typeof AiSelectionToast>;

function setup(props: Props) {
  const { renderer, unmount } = render(<AiSelectionToast {...props} />);
  const texts = () =>
    renderer.root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''));
  const buttons = () => renderer.root.findAllByType(Pressable);
  return { texts, buttons, unmount };
}

describe('AiSelectionToast', () => {
  let announce: jest.SpyInstance;
  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    announce.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('updated shows level, count and unchanged-picks line', () => {
    const { texts } = setup({
      variant: 'updated',
      level: 'more',
      count: 94,
      onDismiss: jest.fn(),
    });
    expect(texts()).toEqual([
      'Recommendations updated · More',
      '94 recommended photos. Your picked photos are unchanged.',
    ]);
  });

  it('updated uses singular for one photo', () => {
    const { texts } = setup({
      variant: 'updated',
      level: 'fewer',
      count: 1,
      onDismiss: jest.fn(),
    });
    expect(texts()[1]).toBe(
      '1 recommended photo. Your picked photos are unchanged.',
    );
  });

  it('failed shows both lines and only a close button', () => {
    const { texts, buttons } = setup({
      variant: 'failed',
      onDismiss: jest.fn(),
    });
    expect(texts()).toEqual([
      "Couldn't update recommendations",
      'Previous results kept',
    ]);
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].props.accessibilityLabel).toBe('Dismiss');
  });

  it('close has role button and label, press calls onDismiss', () => {
    const onDismiss = jest.fn();
    const { buttons } = setup({ variant: 'failed', onDismiss });
    expect(buttons()[0].props.accessibilityRole).toBe('button');
    press(buttons()[0]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('announces title and detail once on mount', () => {
    setup({ variant: 'failed', onDismiss: jest.fn() });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "Couldn't update recommendations. Previous results kept",
    );
  });

  it('auto-dismisses after 5000 ms', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    setup({ variant: 'failed', onDismiss });
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
