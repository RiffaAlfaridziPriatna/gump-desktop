import React from 'react';
import {AccessibilityInfo, Text} from 'react-native';
import {getByLabel, press, render} from '../helpers/render';
import {ApplyLookScopeModal} from '../../src/components/modals/ApplyLookScopeModal';
import {focusDesktopNode} from '../../src/components/modals/focusDesktopNode';

jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));

type Props = React.ComponentProps<typeof ApplyLookScopeModal>;

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    lookLabel: 'Warm Romantic',
    onApplyAll: jest.fn(),
    onApplyNewOnly: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  const view = render(<ApplyLookScopeModal {...props} />);
  return {...view, props};
}

function texts(renderer: ReturnType<typeof mount>['renderer']) {
  return renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(3).join(''));
}

describe('ApplyLookScopeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  it('shows title and body with the look label', () => {
    const {renderer} = mount();
    expect(texts(renderer)).toEqual(
      expect.arrayContaining([
        'Apply this new look to existing photos too?',
        'Warm Romantic applies to future uploads.',
      ]),
    );
  });

  it('calls onApplyAll and onApplyNewOnly from labeled buttons', () => {
    const {renderer, props} = mount();
    const all = getByLabel(renderer, 'All album photos');
    const newOnly = getByLabel(renderer, 'New photos only');
    expect(all.props.accessibilityRole).toBe('button');
    expect(newOnly.props.accessibilityRole).toBe('button');
    press(all);
    press(newOnly);
    expect(props.onApplyAll).toHaveBeenCalledTimes(1);
    expect(props.onApplyNewOnly).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('close button is a labeled button that calls onClose', () => {
    const {renderer, props} = mount();
    const close = getByLabel(renderer, 'Close');
    expect(close.props.accessibilityRole).toBe('button');
    press(close);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose, other keys do not', () => {
    const {renderer, props} = mount();
    const keyed = renderer.root.find(
      node => typeof node.props.onKeyDown === 'function',
    );
    keyed.props.onKeyDown({nativeEvent: {key: 'Enter'}});
    expect(props.onClose).not.toHaveBeenCalled();
    keyed.props.onKeyDown({nativeEvent: {key: 'Escape'}});
    keyed.props.onKeyDown({nativeEvent: {code: 'Escape'}});
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('focuses primary and announces again when the body changes', () => {
    const {rerender, props} = mount();
    expect(focusDesktopNode).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Apply this new look to existing photos too? Warm Romantic applies to future uploads.',
    );
    rerender(<ApplyLookScopeModal {...props} lookLabel="Film Mood" />);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(2);
  });

  it('does not announce when hidden', () => {
    mount({visible: false});
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});
