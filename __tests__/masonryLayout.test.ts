import {
  distributeToColumns,
  getColumnCount,
  getColumnWidth,
  getItemHeight,
} from '../src/lib/masonryLayout';

describe('masonryLayout', () => {
  it('uses 3 columns on desktop widths', () => {
    expect(getColumnCount(1024)).toBe(3);
    expect(getColumnCount(768)).toBe(3);
  });

  it('uses 2 columns on narrow widths', () => {
    expect(getColumnCount(767)).toBe(2);
  });

  it('matches site column width formula', () => {
    expect(getColumnWidth(900, 3, 12)).toBeCloseTo((900 - 36) / 3);
  });

  it('computes item height from aspect ratio', () => {
    expect(getItemHeight(300, 400, 300)).toBe(225);
    expect(getItemHeight(300, 300, 400)).toBe(400);
  });

  it('packs items into the shortest column', () => {
    const items = [
      {id: 'a', width: 400, height: 300},
      {id: 'b', width: 400, height: 300},
      {id: 'c', width: 300, height: 400},
    ];
    const columns = distributeToColumns(items, 3, 100, 12);
    expect(columns.flat().map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(columns[0]).toHaveLength(1);
    expect(columns[1]).toHaveLength(1);
    expect(columns[2]).toHaveLength(1);
  });
});
