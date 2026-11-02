import React from 'react';
import {Text} from 'react-native';
import {CulledAlbumDetailSidebar} from '../../src/components/culling/CulledAlbumDetailSidebar';
import {FACES_EMPTY_HINT} from '../../src/components/culling/FacesInPhotoPanel';
import {getByLabel, press, render} from '../helpers/render';

type Props = React.ComponentProps<typeof CulledAlbumDetailSidebar>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    isMobileLayout: false,
    totalPhotos: 635,
    actionCount: 148,
    selectionFilter: null,
    hasActiveFilter: false,
    onSelectionFilterChange: jest.fn(),
    activeFilters: {
      aiSelected: false,
      maybe: false,
      blurred: false,
      closedEyes: false,
      duplicated: false,
    },
    onToggleFilter: jest.fn(),
    filterCounts: {
      aiSelected: 61,
      maybe: 92,
      blurred: 2,
      closedEyes: 120,
      duplicated: 349,
    },
    cullFiltersExpanded: true,
    onCullFiltersToggle: jest.fn(),
    focusedPhoto: null,
    onUploadSelected: jest.fn(),
    onExport: jest.fn(),
    onEditPhotos: jest.fn(),
    ...overrides,
  };
  const {renderer} = render(<CulledAlbumDetailSidebar {...props} />);
  return {props, renderer};
}

describe('CulledAlbumDetailSidebar', () => {
  it('renders sections in Figma order and no Key Faces', () => {
    const {renderer} = setup();
    const texts = renderer.root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''));
    const idx = (s: string) => texts.findIndex(t => t.includes(s));
    expect(idx('Edit Photos')).toBeLessThan(idx('All Photos'));
    expect(idx('All Photos')).toBeLessThan(idx('AI Recommended'));
    expect(idx('AI Recommended')).toBeLessThan(idx('Faces in This Photo'));
    expect(texts).toContain(FACES_EMPTY_HINT);
    expect(texts.some(t => t.includes('Key Faces'))).toBe(false);
  });

  it('All Photos clears only the selection filter', () => {
    const {props, renderer} = setup({selectionFilter: 'selected'});
    press(getByLabel(renderer, 'All Photos, 635'));
    expect(props.onSelectionFilterChange).toHaveBeenCalledWith(null);
    expect(props.onToggleFilter).not.toHaveBeenCalled();
  });

  it('Picked toggles selected and null', () => {
    const a = setup();
    press(getByLabel(a.renderer, 'Picked for Upload, 148'));
    expect(a.props.onSelectionFilterChange).toHaveBeenCalledWith('selected');
    const b = setup({selectionFilter: 'selected'});
    press(getByLabel(b.renderer, 'Picked for Upload, 148'));
    expect(b.props.onSelectionFilterChange).toHaveBeenCalledWith(null);
  });
});
