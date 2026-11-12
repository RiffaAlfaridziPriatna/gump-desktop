import React from 'react';
import {act} from 'react-test-renderer';
import {View} from 'react-native';
import {PhotoDetailImageViewer} from '../../src/components/culling/PhotoDetailImageViewer';
import {FaceStatusIconBadge} from '../../src/components/culling/FaceStatusIconBadge';
import {render} from '../helpers/render';

jest.mock('../../src/lib/media/imagePreload', () => ({
  preloadImage: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/components/look/LookPreviewImage', () => {
  const ReactLocal = require('react');
  const {View: RNView} = require('react-native');
  return {
    LookPreviewImage: ({
      onLoad,
      style,
    }: {
      onLoad?: (event: {
        nativeEvent: {source: {width: number; height: number}};
      }) => void;
      style?: unknown;
    }) => {
      ReactLocal.useEffect(() => {
        onLoad?.({nativeEvent: {source: {width: 800, height: 600}}});
      }, [onLoad]);
      return <RNView testID="look-preview" style={style} />;
    },
  };
});

const face = {
  faceId: 'f1',
  boundingBox: {left: 0.2, top: 0.2, width: 0.2, height: 0.2},
  eyeStatus: 'open',
  focusLevel: 'good',
  landmarks: {},
} as never;

function mount(showAiMarkers: boolean) {
  const view = render(
    <PhotoDetailImageViewer
      uri="file:///photo.jpg"
      photoId="p1"
      faces={[face]}
      zoomFaceIndex={null}
      imageSize={{width: 800, height: 600}}
      showAiMarkers={showAiMarkers}
    />,
  );
  const root = view.renderer.root.findByType(View);
  act(() => {
    root.props.onLayout?.({
      nativeEvent: {layout: {x: 0, y: 0, width: 920, height: 640}},
    });
  });
  return view;
}

describe('PhotoDetailImageViewer showAiMarkers', () => {
  it('shows face status badges when markers are on', () => {
    const {renderer} = mount(true);
    expect(renderer.root.findAllByType(FaceStatusIconBadge).length).toBeGreaterThan(
      0,
    );
  });

  it('hides face status badges when markers are off', () => {
    const {renderer} = mount(false);
    expect(renderer.root.findAllByType(FaceStatusIconBadge)).toHaveLength(0);
  });
});
