import React from 'react';
import { act } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import {
  FACES_EMPTY_HINT,
  FacesInPhotoPanel,
  VIEWER_FACE_HEIGHT,
  VIEWER_FACE_ROW_GAP,
  VIEWER_FACES_BODY_MIN_HEIGHT,
  viewerFacesBodyHeight,
  type FacesInPhotoPanelFace,
  type FacesInPhotoPanelPhoto,
} from '../../src/components/culling/FacesInPhotoPanel';
import { FACE_ASSESSMENT_DELAY_MAX_MS } from '../../src/hooks/useFaceAssessmentLoading';
import { getFacePanelStatus } from '../../src/lib/culling/facePanelStatus';
import { colors } from '../../src/lib/ui/colors';
import { fonts } from '../../src/lib/ui/typography';
import { Pressable } from '../../src/components/ui';
import { press, render } from '../helpers/render';

const bounds = { left: 0.1, top: 0.1, width: 0.2, height: 0.2 };

function face(
  id: string,
  eyeStatus: string,
  focusLevel: string,
): FacesInPhotoPanelFace {
  return {
    faceId: id,
    bounds,
    eyeStatus,
    focusLevel,
  } as FacesInPhotoPanelFace;
}

function photo(
  faces: FacesInPhotoPanelFace[],
  photoId = 'p1',
): FacesInPhotoPanelPhoto {
  return { photoId, fileName: `${photoId}.jpg`, uri: 'file:///x.jpg', faces };
}

function texts(renderer: ReturnType<typeof render>['renderer']) {
  return renderer.root.findAllByType(Text).map(t => t.props.children);
}

function settle() {
  act(() => {
    jest.advanceTimersByTime(FACE_ASSESSMENT_DELAY_MAX_MS);
  });
}

describe('FacesInPhotoPanel', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the empty copy with no focused photo', () => {
    const { renderer } = render(<FacesInPhotoPanel photo={null} />);
    expect(texts(renderer)).toContain(FACES_EMPTY_HINT);
    expect(FACES_EMPTY_HINT).toBe(
      'Choose Inspect faces on a photo to check eyes and sharpness here.',
    );
  });

  it('shows loading with the file name, then the faces after the delay', () => {
    const { renderer } = render(
      <FacesInPhotoPanel photo={photo([face('a', 'open', 'good')])} />,
    );
    expect(texts(renderer)).toContain('Loading face assessment…');
    expect(texts(renderer)).toContain('p1.jpg');
    settle();
    expect(texts(renderer)).not.toContain('Loading face assessment…');
    expect(texts(renderer)).toContain('Faces in This Photo · 1');
  });

  it('restarts loading when focus changes before the delay ends', () => {
    const a = photo([face('a', 'open', 'good')], 'p1');
    const b = photo([face('b', 'open', 'good')], 'p2');
    const { renderer, rerender } = render(<FacesInPhotoPanel photo={a} />);
    act(() => {
      jest.advanceTimersByTime(FACE_ASSESSMENT_DELAY_MAX_MS - 100);
    });
    rerender(<FacesInPhotoPanel photo={b} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(texts(renderer)).toContain('Loading face assessment…');
    settle();
    expect(texts(renderer)).toContain('Faces in This Photo · 1');
  });

  it('shows the face count and a labelled row per face', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([
          face('a', 'closed', 'good'),
          face('b', 'open', 'soft'),
          face('c', 'open', 'good'),
        ])}
      />,
    );
    settle();
    expect(texts(renderer)).toContain('Faces in This Photo · 3');
    const labels = renderer.root
      .findAll(
        n =>
          n.type === 'View' &&
          !n.props.accessibilityRole &&
          n.props.accessible &&
          n.props.accessibilityLabel,
      )
      .map(n => n.props.accessibilityLabel);
    expect(labels).toEqual([
      'Check eyes',
      'Possible soft focus',
      'Eyes open',
    ]);
  });

  it('shows No faces detected for empty faces', () => {
    const { renderer } = render(<FacesInPhotoPanel photo={photo([])} />);
    settle();
    expect(texts(renderer)).toContain('No faces detected.');
    expect(texts(renderer)).toContain('Faces in This Photo');
  });

  it('renders an invalid face as Unable to assess without failing the panel', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'open', 'good'), face('b', 'weird', 'good')])}
      />,
    );
    settle();
    expect(texts(renderer)).toContain('Unable to assess');
    expect(texts(renderer)).toContain('Eyes open');
    expect(texts(renderer)).not.toContain('Face assessment unavailable.');
  });

  it('shows unavailable only when every face is invalid', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'weird', 'good'), face('b', 'open', 'nope')])}
      />,
    );
    settle();
    expect(texts(renderer)).toContain('Face assessment unavailable.');
  });

  it('labels the header with the visible title and count', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'open', 'good'), face('b', 'open', 'good')])}
      />,
    );
    settle();
    const header = renderer.root.find(
      n => n.props.accessibilityRole === 'button',
    );
    expect(header.props.accessibilityLabel).toBe('Faces in This Photo, 2 faces');
  });

  it('announces once after loading, not on collapse or expand', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    spy.mockClear();
    const { renderer } = render(
      <FacesInPhotoPanel photo={photo([face('a', 'open', 'good')])} />,
    );
    expect(spy).not.toHaveBeenCalled();
    settle();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('1 face');
    const header = () =>
      renderer.root.find(n => n.props.accessibilityRole === 'button');
    press(header());
    press(header());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('collapses and expands, exposing expanded state', () => {
    const { renderer } = render(
      <FacesInPhotoPanel photo={photo([face('a', 'open', 'good')])} />,
    );
    settle();
    const header = () =>
      renderer.root.find(n => n.props.accessibilityRole === 'button');
    expect(header().props.accessibilityState).toEqual({ expanded: true });
    press(header());
    expect(header().props.accessibilityState).toEqual({ expanded: false });
    expect(texts(renderer)).not.toContain('Eyes open');
    press(header());
    expect(texts(renderer)).toContain('Eyes open');
  });
});

describe('getFacePanelStatus', () => {
  it('maps eyes and focus wording', () => {
    const labels = (e: string, f: string) =>
      getFacePanelStatus({ eyeStatus: e, focusLevel: f } as never).labels.map(
        l => l.text,
      );
    expect(labels('closed', 'good')).toEqual(['Check eyes']);
    expect(labels('partial', 'blurred')).toEqual([
      'Check eyes',
      'Possible soft focus',
    ]);
    expect(labels('open', 'soft')).toEqual([
      'Eyes open',
      'Possible soft focus',
    ]);
    expect(labels('x', 'good')).toEqual(['Unable to assess']);
    expect(labels('open', 'nope')).toEqual(['Unable to assess']);
  });
});

describe('FacesInPhotoPanel Figma values', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const styleOf = (
    renderer: ReturnType<typeof render>['renderer'],
    text: string,
  ) =>
    StyleSheet.flatten(
      renderer.root.findAllByType(Text).find(t => t.props.children === text)!
        .props.style,
    );

  it('heading is Inter SemiBold 16 white', () => {
    const { renderer } = render(<FacesInPhotoPanel photo={null} />);
    expect(styleOf(renderer, 'Faces in This Photo')).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 16,
      color: colors.white,
    });
  });

  it('warning labels are Inter SemiBold 11 gold, others Regular gray', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'closed', 'good'), face('b', 'open', 'good')])}
      />,
    );
    settle();
    expect(styleOf(renderer, 'Check eyes')).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 11,
      color: '#FFD700',
    });
    expect(styleOf(renderer, 'Eyes open')).toMatchObject({
      fontFamily: fonts.sans,
      fontSize: 11,
    });
  });
});

describe('FacesInPhotoPanel viewer variant', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const viewerPanel = () =>
    render(
      <FacesInPhotoPanel
        variant="viewer"
        photo={photo([face('a', 'closed', 'good'), face('b', 'open', 'soft')])}
      />,
    );

  it('shows Faces in This Photo, not Key Faces, with no collapse toggle', () => {
    const { renderer } = viewerPanel();
    settle();
    const all = texts(renderer).join('|');
    expect(all).toContain('Faces in This Photo · 2');
    expect(all).not.toContain('Key Faces');
    expect(
      renderer.root.findAll(
        n => n.props.accessibilityState?.expanded !== undefined,
      ),
    ).toHaveLength(0);
  });

  it('shows gold issue chips with counts in Inter SemiBold 12', () => {
    const { renderer } = viewerPanel();
    settle();
    const chip = StyleSheet.flatten(
      renderer.root
        .findAllByType(Text)
        .find(t => t.props.children === 'Check eyes · 1')!.props.style,
    );
    expect(chip).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 12,
      color: '#FFD700',
    });
    expect(texts(renderer)).toContain('Possible soft focus · 1');
  });
  it('viewer: faces are buttons that report their index and selection', () => {
    const onFacePress = jest.fn();
    const { renderer } = render(
      <FacesInPhotoPanel
        variant="viewer"
        photo={photo([face('a', 'open', 'good'), face('b', 'closed', 'good')])}
        selectedIndex={1}
        onFacePress={onFacePress}
      />,
    );
    settle();
    const buttons = renderer.root.findAllByType(Pressable);
    expect(buttons.map(b => b.props.accessibilityState.selected)).toEqual([
      false,
      true,
    ]);
    press(buttons[0]);
    expect(onFacePress).toHaveBeenCalledWith(0);
  });

  it('viewer faces body stays 180 for loading and up to 8 faces', () => {
    expect(VIEWER_FACES_BODY_MIN_HEIGHT).toBe(
      VIEWER_FACE_HEIGHT * 2 + VIEWER_FACE_ROW_GAP,
    );
    expect(viewerFacesBodyHeight(0)).toBe(180);
    expect(viewerFacesBodyHeight(1)).toBe(180);
    expect(viewerFacesBodyHeight(8)).toBe(180);
    expect(viewerFacesBodyHeight(9)).toBe(
      VIEWER_FACE_HEIGHT * 3 + VIEWER_FACE_ROW_GAP * 2,
    );

    const loading = render(
      <FacesInPhotoPanel
        variant="viewer"
        photo={photo([face('a', 'open', 'good')])}
      />,
    );
    const loadingBody = loading.renderer.root
      .findAllByType(View)
      .find(v => StyleSheet.flatten(v.props.style)?.minHeight === 180);
    expect(loadingBody).toBeDefined();

    const settled = render(
      <FacesInPhotoPanel
        variant="viewer"
        photo={photo([face('a', 'open', 'good')])}
      />,
    );
    settle();
    const grid = settled.renderer.root
      .findAllByType(View)
      .find(v => {
        const style = StyleSheet.flatten(v.props.style) ?? {};
        return style.minHeight === 180 && style.rowGap === 16;
      });
    expect(grid).toBeDefined();
    const tile = settled.renderer.root
      .findAllByType(View)
      .find(v => {
        const style = StyleSheet.flatten(v.props.style) ?? {};
        return style.width === 73 && style.height === VIEWER_FACE_HEIGHT;
      });
    expect(tile).toBeDefined();
  });

  it('viewer: Show AI markers switch toggles and is absent in sidebar', () => {
    const onShowAiMarkersChange = jest.fn();
    const { renderer } = render(
      <FacesInPhotoPanel
        variant="viewer"
        photo={photo([face('a', 'open', 'good')])}
        showAiMarkers
        onShowAiMarkersChange={onShowAiMarkersChange}
      />,
    );
    settle();
    expect(texts(renderer)).toContain('Show AI markers');
    const toggle = renderer.root.find(
      n =>
        n.props.accessibilityRole === 'switch' &&
        n.props.accessibilityLabel === 'Show AI markers',
    );
    expect(toggle.props.accessibilityState).toEqual({checked: true});
    press(toggle);
    expect(onShowAiMarkersChange).toHaveBeenCalledWith(false);

    const sidebar = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'open', 'good')])}
        showAiMarkers
        onShowAiMarkersChange={onShowAiMarkersChange}
      />,
    );
    settle();
    expect(texts(sidebar.renderer)).not.toContain('Show AI markers');
  });

  it('sidebar: faces are not pressable', () => {
    const { renderer } = render(
      <FacesInPhotoPanel
        photo={photo([face('a', 'open', 'good')])}
        onFacePress={jest.fn()}
      />,
    );
    settle();
    expect(
      renderer.root.findAll(n => n.props.accessibilityHint === 'Zoom to this face'),
    ).toHaveLength(0);
  });

  it('shows one label per face, eyes before focus', () => {
    const { renderer } = render(
      <FacesInPhotoPanel photo={photo([face('a', 'closed', 'soft')])} />,
    );
    settle();
    const t = texts(renderer);
    expect(t).toContain('Check eyes');
    expect(t).not.toContain('Possible soft focus');
  });
});
