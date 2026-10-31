import {
  buildRows,
  createGetItemLayout,
  HEADER_ROW_HEIGHT,
  keepKnownPhotos,
  sectionsLayoutKey,
  type CulledAlbumGridSection,
} from '../src/components/culling/culledAlbumGridRows';

// Verbatim copy of the pre-move buildRows, as the flat-output oracle.
function legacyBuildRows(photoIds: string[]) {
  const rows = [];
  for (let index = 0; index < photoIds.length; index += 3) {
    const rowPhotoIds = photoIds.slice(index, index + 3);
    const rowIndex = index / 3;
    rows.push({
      key: `row-${rowIndex}:${rowPhotoIds.join(',')}`,
      rowIndex,
      cells: rowPhotoIds.map((photoId, columnIndex) => ({
        photoId,
        index: index + columnIndex,
      })),
    });
  }
  return rows;
}

const ids = (n: number, prefix = 'p') =>
  Array.from({length: n}, (_, i) => `${prefix}${i}`);

describe('buildRows flat', () => {
  it.each([0, 1, 3, 7, 9])('matches legacy output for %i photos', n => {
    const rows = buildRows(ids(n));
    expect(rows.map(({kind: _kind, ...rest}) => rest)).toEqual(
      legacyBuildRows(ids(n)),
    );
    expect(rows.every(row => row.kind === 'photos')).toBe(true);
  });

  it('uses O(1) fixed-height layout', () => {
    const layout = createGetItemLayout(buildRows(ids(9)), 100);
    expect(layout(null, 2)).toEqual({length: 100, offset: 200, index: 2});
  });
});

describe('buildRows sections', () => {
  const a = ids(4, 'a');
  const b = ids(2, 'b');
  const sections: CulledAlbumGridSection[] = [
    {key: 'g1', title: 'Group 1', subtitle: '4 shots', isGroup: true, photoIds: a},
    {key: 'empty', title: 'Empty', photoIds: []},
    {key: 'other', title: 'Other matching photos', photoIds: b},
  ];
  const rows = buildRows([...a, ...b], sections);

  it('header rows carry no photo cells and empty sections are skipped', () => {
    const headers = rows.filter(row => row.kind === 'header');
    expect(headers.map(h => h.key)).toEqual(['header-g1', 'header-other']);
    expect(headers.every(h => !('cells' in h))).toBe(true);
  });

  it('rows and layout key ignore header text (structural equality)', () => {
    const retitled = sections.map(s => ({...s, title: 'X', subtitle: 'Y'}));
    expect(buildRows([...a, ...b], retitled)).toEqual(rows);
    expect(sectionsLayoutKey(retitled)).toBe(sectionsLayoutKey(sections));
  });

  it('skips section ids with no photo', () => {
    const kept = keepKnownPhotos(sections, ['a0', 'a1', 'b1'].join('\0'));
    expect(kept.map(s => s.photoIds)).toEqual([['a0', 'a1'], [], ['b1']]);
    const cells = buildRows(['a0', 'a1', 'b1'], kept).flatMap(r =>
      r.kind === 'photos' ? r.cells.map(c => [c.photoId, c.index]) : [],
    );
    expect(cells).toEqual([['a0', 0], ['a1', 1], ['b1', 2]]);
  });

  it('never shares a row between groups and keeps global indexes', () => {
    expect(rows.map(r => r.kind)).toEqual([
      'header',
      'photos',
      'photos',
      'header',
      'photos',
    ]);
    const photoRows = rows.flatMap(r => (r.kind === 'photos' ? [r] : []));
    expect(photoRows.map(r => r.cells.map(c => c.photoId))).toEqual([
      ['a0', 'a1', 'a2'],
      ['a3'],
      ['b0', 'b1'],
    ]);
    expect(photoRows.flatMap(r => r.cells.map(c => c.index))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(new Set(rows.map(r => r.key)).size).toBe(rows.length);
  });

  it('layout accounts for header height', () => {
    const layout = createGetItemLayout(rows, 100);
    expect(layout(null, 0)).toEqual({length: HEADER_ROW_HEIGHT, offset: 0, index: 0});
    expect(layout(null, 3)).toEqual({
      length: HEADER_ROW_HEIGHT,
      offset: HEADER_ROW_HEIGHT + 200,
      index: 3,
    });
    // row 2 is the partial last row of group 1; row 4 follows the second header
    expect(layout(null, 2)).toEqual({
      length: 100,
      offset: HEADER_ROW_HEIGHT + 100,
      index: 2,
    });
    expect(layout(null, 4)).toEqual({
      length: 100,
      offset: HEADER_ROW_HEIGHT * 2 + 200,
      index: 4,
    });
  });
});
