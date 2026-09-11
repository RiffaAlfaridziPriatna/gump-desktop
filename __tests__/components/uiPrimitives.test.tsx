import React from 'react';
import {ActivityIndicator, Text} from 'react-native';
import {Button} from '../../src/components/ui/Button';
import {Checkbox} from '../../src/components/ui/Checkbox';
import {Badge} from '../../src/components/ui/Badge';
import {press, render} from '../helpers/render';

describe('Button', () => {
  it('invokes onPress and shows the title', () => {
    const onPress = jest.fn();
    const {renderer} = render(<Button title="Save" onPress={onPress} />);
    expect(renderer.root.findByType(Text).props.children).toBe('Save');
    press(renderer.root.findAllByProps({onPress})[0]!);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading or disabled', () => {
    const onPress = jest.fn();
    const loading = render(
      <Button title="Save" onPress={onPress} loading />,
    );
    expect(loading.renderer.root.findByType(ActivityIndicator)).toBeTruthy();
    press(loading.renderer.root.findAllByProps({onPress, disabled: true})[0]!);
    expect(onPress).not.toHaveBeenCalled();

    const disabled = render(
      <Button title="Save" onPress={onPress} disabled />,
    );
    press(disabled.renderer.root.findAllByProps({onPress, disabled: true})[0]!);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Checkbox', () => {
  it('toggles and renders children', () => {
    const onToggle = jest.fn();
    const {renderer} = render(
      <Checkbox checked={false} onToggle={onToggle}>
        <Text>Keep</Text>
      </Checkbox>,
    );
    expect(renderer.root.findByType(Text).props.children).toBe('Keep');
    press(renderer.root.findAllByProps({onPress: onToggle})[0]!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Badge', () => {
  it('defaults uploaded and culled labels', () => {
    const uploaded = render(<Badge variant="uploaded" />);
    expect(
      uploaded.renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Uploaded',
      ),
    ).toBe(true);

    const culled = render(<Badge variant="culled" label="Reviewed" />);
    expect(
      culled.renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Reviewed',
      ),
    ).toBe(true);
  });
});
