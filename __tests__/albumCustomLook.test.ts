import {CulledAlbum} from '../src/domain/entities/CulledAlbum';
import {parseLookFinishing} from '../src/domain/valueObjects/LookFinishing';
import {getLookLabel, LOOK_CATALOG} from '../src/lib/look/lookCatalog';
import {hasAppliedLook} from '../src/lib/look/types';
import {makeDomainAlbum} from './helpers/fixtures';

const reload = (plain: unknown) =>
  CulledAlbum.fromPlain(JSON.parse(JSON.stringify(plain)));

const preset = {name: 'Golden Hour', revision: 'r1', finishing: null};

describe('album custom look', () => {
  it('round trips an old album without customLook as null', () => {
    const plain = makeDomainAlbum().toPlain();
    delete plain.customLook;
    const album = reload(plain);
    expect(album.customLook).toBeNull();
    expect(reload(album.toPlain()).toPlain()).toEqual({
      ...plain,
      customLook: null,
    });
  });

  it("loads a 'custom' default without a preset as original", () => {
    const plain = {...makeDomainAlbum().toPlain(), defaultLookId: 'custom'};
    expect(reload(plain).defaultLookId).toBe('original');
    const album = makeDomainAlbum();
    album.setDefaultLookId('custom');
    expect(album.defaultLookId).toBe('original');
  });

  it("keeps a 'custom' default when the album has a preset", () => {
    const album = makeDomainAlbum();
    album.replaceCustomLook(preset);
    album.setDefaultLookId('custom');
    const loaded = reload(album.toPlain());
    expect(loaded.defaultLookId).toBe('custom');
    expect(loaded.customLook).toEqual(preset);
  });

  it.each([
    null,
    'x',
    {name: '', revision: 'r1'},
    {name: 'a', revision: 3},
    {name: '   ', revision: 'r1'},
    {name: 'x'.repeat(256), revision: 'r1'},
    {name: 'a', revision: '../x'},
    {name: 'a', revision: 'a/b'},
    {name: 'a', revision: 'r'.repeat(65)},
  ])('reads malformed customLook %p as null', customLook => {
    const plain = {...makeDomainAlbum().toPlain(), customLook};
    expect(reload(plain).customLook).toBeNull();
  });

  it('clamps out-of-range finishing values on read', () => {
    const plain = {
      ...makeDomainAlbum().toPlain(),
      customLook: {
        ...preset,
        finishing: {
          texture: 250,
          clarity: -300,
          dehaze: 40,
          vignetteAmount: -101,
          vignetteMidpoint: -5,
          vignetteFeather: 'soft',
          vignetteRoundness: null,
          grainAmount: 1e9,
          grainSize: -1,
          grainRoughness: Infinity,
        },
      },
    };
    expect(reload(plain).customLook?.finishing).toEqual({
      texture: 100,
      clarity: -100,
      dehaze: 40,
      vignetteAmount: -100,
      vignetteMidpoint: 0,
      vignetteFeather: 50,
      vignetteRoundness: 0,
      grainAmount: 100,
      grainSize: 0,
      grainRoughness: 50,
    });
  });

  it('replaceCustomLook clamps finishing like a read', () => {
    const album = makeDomainAlbum();
    const finishing = {...parseLookFinishing({})!, texture: 500, grainSize: -9};
    album.replaceCustomLook({...preset, finishing});
    expect(album.customLook?.finishing).toMatchObject({
      texture: 100,
      grainSize: 0,
    });
    expect(album.toPlain().customLook).toEqual(album.customLook);
  });

  it('replaceCustomLook throws on an unsafe revision', () => {
    const album = makeDomainAlbum();
    expect(() =>
      album.replaceCustomLook({...preset, revision: '../x'}),
    ).toThrow('Invalid custom look');
    expect(album.customLook).toBeNull();
  });

  it('reads a non-object finishing as null', () => {
    expect(parseLookFinishing(42)).toBeNull();
  });
});

describe('custom look in the catalog', () => {
  it('labels custom with the preset name and keeps the catalog built-in', () => {
    expect(getLookLabel('custom', 'Golden Hour')).toBe('Golden Hour');
    expect(getLookLabel('custom')).toBe('Custom');
    expect(LOOK_CATALOG.map(d => d.id)).not.toContain('custom');
  });

  it('does not bake custom yet', () => {
    expect(hasAppliedLook('custom')).toBe(false);
  });
});
