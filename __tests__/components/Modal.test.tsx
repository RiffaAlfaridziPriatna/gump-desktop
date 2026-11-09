import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {render} from '../helpers/render';
import {Modal} from '../../src/components/ui/Modal';
import {TouchableOpacity} from '../../src/components/ui/TouchableOpacity';

function mount(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = jest.fn();
  const {renderer} = render(
    <Modal visible onClose={onClose} {...props}>
      <Text>body</Text>
    </Modal>,
  );
  const close = renderer.root.findByType(TouchableOpacity);
  const styles = renderer.root
    .findAll(n => typeof n.type === 'string' && n.props.style != null)
    .map(n => StyleSheet.flatten(n.props.style));
  return {
    onClose,
    card: styles.find(s => s.overflow === 'hidden' && s.backgroundColor)!,
    content: styles.find(s => s.alignItems === 'center' && 'paddingTop' in s)!,
    close,
  };
}

describe('Modal', () => {
  it('rounds the card to 8', () => {
    expect(mount().card.borderRadius).toBe(8);
  });

  it('pads content 40 top and bottom, 32 horizontal', () => {
    expect(mount().content).toMatchObject({
      paddingTop: 40,
      paddingBottom: 40,
      paddingHorizontal: 32,
    });
  });

  it('lets contentStyle override padding', () => {
    expect(
      mount({contentStyle: {paddingHorizontal: 0, paddingBottom: 0}}).content,
    ).toMatchObject({paddingTop: 40, paddingBottom: 0, paddingHorizontal: 0});
  });

  it('draws a 24 close icon 24 from top and right, keeping a 32 target', () => {
    const {close, onClose} = mount();
    const box = StyleSheet.flatten(close.props.style);
    expect(box).toMatchObject({position: 'absolute', width: 32, height: 32});
    const icon = close.findByProps({width: 24});
    expect(icon.props.height).toBe(24);
    const inset = (box.width - 24) / 2;
    expect(box.top + inset).toBe(24);
    expect(box.right + inset).toBe(24);
    expect(close.props.hitSlop).toEqual({
      top: 8,
      bottom: 8,
      left: 8,
      right: 8,
    });
    close.props.onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
