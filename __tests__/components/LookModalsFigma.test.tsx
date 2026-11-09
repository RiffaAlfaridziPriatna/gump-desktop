import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { getByLabel, render } from '../helpers/render';
import { AlbumLookStatus } from '../../src/components/culling/AlbumLookStatus';
import { LookCompareToggle } from '../../src/components/look/LookCompareToggle';
import { ApplyLookModal } from '../../src/components/modals/ApplyLookModal';
import { ApplyLookScopeModal } from '../../src/components/modals/ApplyLookScopeModal';
import IconClose from '../../src/assets/images/icon_close.svg';
import { fonts, interSemiBoldStyle } from '../../src/lib/ui/typography';

jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));
jest.mock('../../src/components/look/LookPreviewImage', () => ({
  LookPreviewImage: () => null,
}));
jest.mock('../../src/lib/storage/localStorage', () => ({
  isUsableThumbnailUri: (uri?: string) => Boolean(uri),
  isUsableDetailUri: () => false,
}));

const photo = {
  file: { thumbnailUri: 'file:///t.jpg', uri: 'file:///m.jpg' },
} as never;

type Rendered = ReturnType<typeof render>['renderer'];
type Styled = { props: { style?: unknown; hitSlop?: { top: number; bottom: number } } };

function styleOf(node: Styled) {
  const raw = node.props.style;
  const resolved =
    typeof raw === 'function' ? (raw as (s: { pressed: boolean }) => unknown)({ pressed: false }) : raw;
  return StyleSheet.flatten(resolved as Parameters<typeof StyleSheet.flatten>[0]);
}

function textNode(renderer: Rendered, text: string) {
  const found = renderer.root
    .findAllByType(Text)
    .find(node => [node.props.children].flat(3).join('') === text);
  if (!found) {
    throw new Error(`Text not found: ${text}`);
  }
  return found;
}

function targetSize(node: Styled, height: number) {
  const slop = node.props.hitSlop;
  if (!slop) {
    throw new Error('hitSlop missing');
  }
  return height + slop.top + slop.bottom;
}

describe('look modals to Figma', () => {
  it('picker: text button has no minHeight, close is 24 at 24/24, hit areas >= 44', () => {
    const { renderer } = render(
      <ApplyLookModal
        visible
        albumName="A"
        previewPhoto={photo}
        currentLookId="cleanNatural"
        onUseLook={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const cancel = getByLabel(renderer, 'Cancel');
    expect(styleOf(cancel).minHeight).toBeUndefined();
    expect(targetSize(cancel, 14 * 1.44)).toBeGreaterThanOrEqual(44);
    const close = getByLabel(renderer, 'Close');
    expect(styleOf(close)).toMatchObject({ top: 24, right: 24, width: 24, height: 24 });
    expect(targetSize(close, 24)).toBeGreaterThanOrEqual(44);
    expect(close.findByType(IconClose).props).toMatchObject({
      width: 24,
      height: 24,
    });
    expect(styleOf(textNode(renderer, 'Choose a look for this album'))).toMatchObject({
      fontFamily: fonts.sansSemiBold,
    });
  });

  it('scope: New photos only has no minHeight, close is 24 at 24/24', () => {
    const { renderer } = render(
      <ApplyLookScopeModal
        visible
        lookLabel="X"
        onApplyAll={jest.fn()}
        onApplyNewOnly={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const only = getByLabel(renderer, 'New photos only');
    expect(styleOf(only).minHeight).toBeUndefined();
    expect(targetSize(only, 14 * 1.44)).toBeGreaterThanOrEqual(44);
    const close = getByLabel(renderer, 'Close');
    expect(styleOf(close)).toMatchObject({ top: 24, right: 24, width: 24, height: 24 });
    expect(targetSize(close, 24)).toBeGreaterThanOrEqual(44);
    expect(close.findByType(IconClose).props).toMatchObject({
      width: 24,
      height: 24,
    });
  });

  it('toggle: Before line height 1.6, After 1.4', () => {
    const { renderer } = render(<LookCompareToggle showAfter onChange={jest.fn()} />);
    expect(styleOf(textNode(renderer, 'Before')).lineHeight).toBeCloseTo(14 * 1.6);
    expect(styleOf(textNode(renderer, 'After')).lineHeight).toBeCloseTo(14 * 1.4);
  });

  it('status: label Red Hat SemiBold, Change Inter SemiBold orange', () => {
    const { renderer } = render(
      <AlbumLookStatus lookLabel="Style 2" onChange={jest.fn()} />,
    );
    expect(styleOf(textNode(renderer, 'Look: Style 2'))).toMatchObject({
      fontFamily: fonts.sansSemiBold,
      fontSize: 14,
    });
    const change = styleOf(textNode(renderer, 'Change'));
    expect(change).toMatchObject({ fontFamily: fonts.interSemiBold, fontSize: 14 });
    expect(change).toMatchObject(interSemiBoldStyle);
    expect(String(change.color).toLowerCase()).toBe('#ff9632');
  });
});
