import React from 'react';
import {Text} from 'react-native';
import {UploadPickedButton} from '../../src/components/culling/UploadPickedButton';
import {getAllByRole, render} from '../helpers/render';

const NOTE = 'Upload includes picked photos outside this view.';

function texts(renderer: ReturnType<typeof render>['renderer']) {
  return renderer.root.findAllByType(Text).map(t => t.props.children);
}

describe('UploadPickedButton', () => {
  const base = {
    pickedCount: 148,
    uploaded: false,
    disabled: false,
    includesHidden: false,
    onPress: jest.fn(),
  };

  it('reads Upload Picked (N) without the note when no filter is active', () => {
    const {renderer} = render(<UploadPickedButton {...base} />);
    expect(texts(renderer)).toEqual(['Upload Picked (148)']);
  });

  it('shows the note only when the view is filtered', () => {
    const {renderer} = render(<UploadPickedButton {...base} includesHidden />);
    expect(texts(renderer)).toEqual(['Upload Picked (148)', NOTE]);
  });

  it('is disabled and unnumbered at zero picked', () => {
    const {renderer} = render(
      <UploadPickedButton {...base} pickedCount={0} disabled />,
    );
    const [button] = getAllByRole(renderer, 'button');
    expect(button?.props.accessibilityState).toEqual({disabled: true});
    expect(texts(renderer)).toEqual(['Upload Picked']);
  });

  it('presses through when enabled', () => {
    const onPress = jest.fn();
    const {renderer} = render(<UploadPickedButton {...base} onPress={onPress} />);
    getAllByRole(renderer, 'button')[0]?.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
