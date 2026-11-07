import React from 'react';
import { Pressable } from '../../src/components/ui';
import { Text } from 'react-native';
import { AiSelectionSection } from '../../src/components/culling/AiSelectionSection';
import { press, render } from '../helpers/render';

const byRole = (r: ReturnType<typeof render>['renderer'], role: string) =>
  r.root.findAll(
    n =>
      n.props.accessibilityRole === role &&
      (role === 'header' || role === 'radiogroup'
        ? typeof n.type === 'string'
        : n.type === Pressable),
  );

type Props = React.ComponentProps<typeof AiSelectionSection>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    draftLevel: 'balanced',
    status: 'idle',
    onLevelChange: jest.fn(),
    onUpdate: jest.fn(),
    ...overrides,
  };
  const { renderer } = render(<AiSelectionSection {...props} />);
  const texts = () =>
    renderer.root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''));
  return { props, renderer, texts };
}

describe('AiSelectionSection', () => {
  it('renders caption header, three radios in a radiogroup, selected state', () => {
    const { renderer, texts } = setup();
    expect(byRole(renderer, 'header')).toHaveLength(1);
    expect(byRole(renderer, 'radiogroup')).toHaveLength(1);
    expect(
      byRole(renderer, 'radio').map(r => r.props.accessibilityLabel),
    ).toEqual(['Fewer', 'Balanced', 'More']);
    expect(byRole(renderer, 'radio')[1].props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(byRole(renderer, 'radio')[2].props.accessibilityState.selected).toBe(
      false,
    );
    expect(texts()).toContain(
      'Changes AI recommendations only. Your picked photos stay unchanged.',
    );
  });

  it.each([
    ['fewer', 'Only the best shots'],
    ['balanced', 'Balance quality, variety and coverage.'],
    ['more', 'A broader selection'],
  ] as const)('shows helper copy for %s', (draftLevel, copy) => {
    expect(setup({ draftLevel }).texts()).toContain(copy);
  });

  it('segment press calls onLevelChange', () => {
    const { props, renderer } = setup();
    press(byRole(renderer, 'radio')[2]);
    expect(props.onLevelChange).toHaveBeenCalledWith('more');
  });

  it('button press calls onUpdate', () => {
    const { props, renderer } = setup();
    const button = byRole(renderer, 'button')[0];
    expect(button.props.accessibilityRole).toBe('button');
    press(button);
    expect(props.onUpdate).toHaveBeenCalledTimes(1);
  });

  it('updating state shows copy, busy button, disabled controls', () => {
    const { props, renderer, texts } = setup({ status: 'updating' });
    expect(texts()).toEqual(
      expect.arrayContaining(['Updating…', 'Updating recommendations…']),
    );
    const button = byRole(renderer, 'button')[0];
    expect(button.props.accessibilityLabel).toBe('Updating recommendations');
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    press(button);
    byRole(renderer, 'radio').forEach(r => {
      expect(r.props.accessibilityState.disabled).toBe(true);
      press(r);
    });
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(props.onLevelChange).not.toHaveBeenCalled();
  });
});
