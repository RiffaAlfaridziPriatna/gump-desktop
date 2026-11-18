import React from 'react';
import {Image, Platform} from 'react-native';
import {act} from 'react-test-renderer';
import {render} from './helpers/render';
import {LookPreviewImage} from '../src/components/look/LookPreviewImage';
import {AlbumCustomLookContext} from '../src/context/albumCustomLook';

const mockBakeLookPreviewUri = jest.fn();
const mockGetCachedLookPreviewUri = jest.fn();

jest.mock('../src/lib/look/bakeLookPreview', () => ({
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

  it('remounts the Image on Windows when After switches back to Before', () => {
    mockGetCachedLookPreviewUri.mockReturnValue('file:///baked-cached.jpg');
    const {renderer, rerender} = render(
      <LookPreviewImage uri="file:///thumb.jpg" lookId="cleanNatural" />,
    );
    const after = renderer.root.findByType(Image);
    rerender(<LookPreviewImage uri="file:///thumb.jpg" lookId="original" />);
    const before = renderer.root.findByType(Image);
    expect(before.props.source.uri).toBe('file:///thumb.jpg');
    if (Platform.OS === 'windows') {
      expect(before).not.toBe(after);
    } else {
      expect(before).toBe(after);
    }
  });
});

describe('LookPreviewImage custom look', () => {
  const source = {
    albumId: 'album-1',
    customLook: {revision: 'r1', name: 'Moody Film'},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCachedLookPreviewUri.mockReturnValue(undefined);
    mockBakeLookPreviewUri.mockResolvedValue('file:///baked-custom.jpg');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bakes with the album preset from context', async () => {
    const {renderer} = render(
      <AlbumCustomLookContext.Provider value={source as never}>
        <LookPreviewImage uri="file:///thumb.jpg" lookId="custom" />
      </AlbumCustomLookContext.Provider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(90);
    });
    expect(mockBakeLookPreviewUri).toHaveBeenCalledWith(
      'file:///thumb.jpg',
      'custom',
      source,
    );
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///baked-custom.jpg',
    );
  });

  it('shows the original without a preset and does not bake', async () => {
    const {renderer} = render(
      <AlbumCustomLookContext.Provider
        value={{albumId: 'album-1', customLook: null}}>
        <LookPreviewImage uri="file:///thumb.jpg" lookId="custom" />
      </AlbumCustomLookContext.Provider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(90);
    });
    expect(mockBakeLookPreviewUri).not.toHaveBeenCalled();
    expect(renderer.root.findByType(Image).props.source.uri).toBe(
      'file:///thumb.jpg',
    );
  });

  it('does not pass the preset to a built-in look bake', async () => {
    render(
      <AlbumCustomLookContext.Provider value={source as never}>
        <LookPreviewImage uri="file:///thumb.jpg" lookId="filmMood" />
      </AlbumCustomLookContext.Provider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(90);
    });
    expect(mockBakeLookPreviewUri).toHaveBeenCalledWith(
      'file:///thumb.jpg',
      'filmMood',
      undefined,
    );
  });
});
