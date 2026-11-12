import React from 'react';
import {Image} from 'react-native';
import {act} from 'react-test-renderer';
import {render} from './helpers/render';
import {LookPreviewImage} from '../src/components/look/LookPreviewImage';

const mockBakeLookPreviewUri = jest.fn();
const mockGetCachedLookPreviewUri = jest.fn();

jest.mock('../src/lib/look/bakeLook', () => ({
  bakeLookPreviewUri: (...args: unknown[]) => mockBakeLookPreviewUri(...args),
  getCachedLookPreviewUri: (...args: unknown[]) =>
    mockGetCachedLookPreviewUri(...args),
}));

describe('LookPreviewImage Before/After flicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCachedLookPreviewUri.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps Before frame while After bake is pending (no blank flash)', async () => {
    let resolveBake: (uri: string) => void = () => {};
    mockBakeLookPreviewUri.mockReturnValue(
      new Promise<string>(resolve => {
        resolveBake = resolve;
      }),
    );

    const {renderer, rerender} = render(
      <LookPreviewImage uri="file:///thumb.jpg" lookId="original" />,
    );
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///thumb.jpg',
    );

    rerender(
      <LookPreviewImage uri="file:///thumb.jpg" lookId="cleanNatural" />,
    );
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///thumb.jpg',
    );

    await act(async () => {
      jest.advanceTimersByTime(90);
    });
    expect(mockBakeLookPreviewUri).toHaveBeenCalled();
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///thumb.jpg',
    );

    await act(async () => {
      resolveBake('file:///baked-clean.jpg');
    });
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///baked-clean.jpg',
    );
  });

  it('uses cached After immediately without clearing', () => {
    mockGetCachedLookPreviewUri.mockReturnValue('file:///baked-cached.jpg');
    const {renderer, rerender} = render(
      <LookPreviewImage uri="file:///thumb.jpg" lookId="original" />,
    );
    rerender(
      <LookPreviewImage uri="file:///thumb.jpg" lookId="cleanNatural" />,
    );
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///baked-cached.jpg',
    );
    expect(mockBakeLookPreviewUri).not.toHaveBeenCalled();
  });
});
