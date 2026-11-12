import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {colors} from '../../src/lib/ui/colors';
import {UploadPickedButton} from '../../src/components/culling/UploadPickedButton';
import {getAllByRole, render} from '../helpers/render';

const NOTE = 'Upload includes picked photos outside this view.';
const PICK_HINT = 'Pick photos using the circle beside each filename.';

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

  it('is disabled with a pick hint at zero picked', () => {
    const {renderer} = render(
      <UploadPickedButton {...base} pickedCount={0} disabled includesHidden />,
    );
    const [button] = getAllByRole(renderer, 'button');
    expect(button?.props.accessibilityState).toEqual({disabled: true});
    expect(texts(renderer)).toEqual(['Upload Picked (0)', PICK_HINT]);
  });

  it('hides the pick hint until photos are ready', () => {
    const {renderer} = render(
      <UploadPickedButton {...base} pickedCount={0} disabled photosReady={false} />,
    );
    expect(texts(renderer)).toEqual(['Upload Picked (0)']);
  });

  it('presses through when enabled', () => {
    const onPress = jest.fn();
    const {renderer} = render(<UploadPickedButton {...base} onPress={onPress} />);
    getAllByRole(renderer, 'button')[0]?.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('derives accessible name and hint from state', () => {
    const {renderer} = render(<UploadPickedButton {...base} includesHidden />);
    const [button] = getAllByRole(renderer, 'button');
    expect(button?.props.accessibilityLabel).toBe('Upload 148 picked photos');
    expect(button?.props.accessibilityHint).toBe(
      'Includes picked photos outside this view.',
    );
    const plain = render(<UploadPickedButton {...base} pickedCount={0} disabled />);
    const [zero] = getAllByRole(plain.renderer, 'button');
    expect(zero?.props.accessibilityLabel).toBe('Upload picked photos');
    expect(zero?.props.accessibilityHint).toBe(PICK_HINT);
    const done = render(<UploadPickedButton {...base} uploaded includesHidden />);
    expect(getAllByRole(done.renderer, 'button')[0]?.props.accessibilityLabel).toBe(
      'Uploaded',
    );
  });

  it('shows the disabled state while culling is busy', () => {
    const {renderer} = render(<UploadPickedButton {...base} disabled />);
    expect(getAllByRole(renderer, 'button')[0]?.props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});

describe('UploadPickedButton Figma values', () => {
  const base = {
    pickedCount: 148,
    uploaded: false,
    disabled: false,
    includesHidden: true,
    onPress: jest.fn(),
  };

  it('label is 16 with line height 16 x 1.2', () => {
    const {renderer} = render(<UploadPickedButton {...base} />);
    const label = renderer.root
      .findAllByType(Text)
      .find(t => t.props.children === 'Upload Picked (148)')!;
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      fontSize: 16,
      lineHeight: 19.2,
    });
  });

  it('hint icon is 14 in the Figma stroke gray', () => {
    const {renderer} = render(<UploadPickedButton {...base} />);
    const icons = renderer.root.findAll(
      n => n.type === ('SvgMock' as never) && n.props.width === 14,
    );
    expect(icons).toHaveLength(1);
    expect(icons[0]!.props).toMatchObject({
      height: 14,
      color: colors.textGray,
    });
  });
});
