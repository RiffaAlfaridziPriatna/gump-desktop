import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SimilarShotGroupHeader} from '../../src/components/culling/SimilarShotGroupHeader';
import {
  GROUP_GAP,
  HEADER_BAR_GAP,
  HEADER_BAR_HEIGHT,
  createGetItemLayout,
  headerRowHeight,
} from '../../src/components/culling/culledAlbumGridRows';
import {fonts} from '../../src/lib/ui/typography';
import {render} from '../helpers/render';

const svgIcons = (r: ReturnType<typeof render>['renderer']) =>
  r.root.findAll(n => (n.type as {displayName?: string}).displayName === 'SvgMock');

describe('SimilarShotGroupHeader', () => {
  it('renders group header with hidden layers icon, announced as header', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader
        section={{title: 'Group 1', subtitle: '3 shots · 2 picked', isGroup: true}}
      />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.accessibilityLabel).toBe('Group 1, 3 shots, 2 picked');
    expect(text.props.children).toBe('Group 1 · 3 shots · 2 picked');
    const [icon] = svgIcons(renderer);
    expect([icon?.props.width, icon?.props.height]).toEqual([14.2344, 14.2223]);
    expect(svgIcons(renderer)).toHaveLength(1);
  });

  it('renders plain header without icon', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader section={{title: 'Other matching photos'}} />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.accessibilityLabel).toBe('Other matching photos');
    expect(text.props.children).toBe('Other matching photos');
    expect(svgIcons(renderer)).toHaveLength(0);
  });

  it('draws the Figma bar: #1e1e1e, radius 8, padding 16 x 10, height 37, gap 8', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader
        section={{title: 'Group 1', subtitle: '3 shots', isGroup: true}}
      />,
    );
    const text = renderer.root.findByType(Text);
    const bar = StyleSheet.flatten(text.parent?.props.style);
    expect(bar).toMatchObject({
      height: 37,
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#1E1E1E',
    });
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: '#FFFFFF',
    });
  });

  it('renders at the height the grid layout function assumes', () => {
    const rowHeights = [true, false].map(isFirst => {
      const {renderer} = render(
        <SimilarShotGroupHeader section={{title: 'G'}} isFirst={isFirst} />,
      );
      const root = StyleSheet.flatten(renderer.root.findAllByType(View)[0]?.props.style);
      return root.height;
    });
    expect(rowHeights).toEqual([headerRowHeight(0), headerRowHeight(1)]);
    expect(headerRowHeight(0)).toBe(HEADER_BAR_HEIGHT + HEADER_BAR_GAP);
    expect(headerRowHeight(1)).toBe(HEADER_BAR_HEIGHT + HEADER_BAR_GAP + GROUP_GAP);
    const headers = [0, 1].map(rowIndex => ({
      kind: 'header' as const,
      key: `h${rowIndex}`,
      rowIndex,
      sectionKey: `s${rowIndex}`,
    }));
    const layout = createGetItemLayout(headers, 100);
    expect([layout(null, 0).length, layout(null, 1).length]).toEqual(rowHeights);
  });
});
