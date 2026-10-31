import {
  reuseSections,
  type SimilarShotsViewSection,
} from '../src/lib/culling/similarShotsView';

const make = (): SimilarShotsViewSection[] => [
  {key: 'group-1', title: 'Group 1', subtitle: '3 shots · 1 picked', isGroup: true, photoIds: ['a', 'b']},
  {key: 'rest', title: 'Other', photoIds: ['c']},
];

describe('reuseSections', () => {
  it('returns prev identity for equal content', () => {
    const prev = make();
    expect(reuseSections(prev, make())).toBe(prev);
  });

  it.each<[string, (s: SimilarShotsViewSection[]) => void]>([
    ['title', s => { s[0]!.title = 'Group 2'; }],
    ['subtitle', s => { s[0]!.subtitle = '3 shots · 2 picked'; }],
    ['isGroup', s => { s[0]!.isGroup = false; }],
    ['photoIds content', s => { s[0]!.photoIds = ['a', 'x']; }],
    ['photoIds length', s => { s[0]!.photoIds = ['a']; }],
    ['key', s => { s[1]!.key = 'other'; }],
    ['section count', s => { s.pop(); }],
  ])('returns next when %s changes', (_name, mutate) => {
    const prev = make();
    const next = make();
    mutate(next);
    expect(reuseSections(prev, next)).toBe(next);
  });

  it('returns next when prev or next is undefined', () => {
    const next = make();
    expect(reuseSections(undefined, next)).toBe(next);
    expect(reuseSections(make(), undefined)).toBeUndefined();
    expect(reuseSections(undefined, undefined)).toBeUndefined();
  });
});
