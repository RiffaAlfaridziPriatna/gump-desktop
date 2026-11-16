import {readFileSync} from 'fs';
import {join} from 'path';
import {parseXmpPreset} from '@lib/look/xmpParser';

const NS = 'http://ns.adobe.com/camera-raw-settings/1.0/';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures/presets', name), 'utf8');
}

function xmp(attrs: string[] = [], elements: string[] = [], ns = NS): string {
  return (
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF_NS}">` +
    `<rdf:Description rdf:about="" xmlns:crs="${ns}" ${attrs.join(' ')}>` +
    `${elements.join('')}</rdf:Description></rdf:RDF></x:xmpmeta>`
  );
}

function ok(text: string) {
  const result = parseXmpPreset(text);
  if (!result.ok) {
    throw new Error(`${result.reason}: ${result.detail}`);
  }
  return result;
}

function failure(text: string) {
  const result = parseXmpPreset(text);
  if (result.ok) {
    throw new Error('expected failure');
  }
  return result;
}

const seq = (name: string, items: string[]) =>
  `<crs:${name}><rdf:Seq>${items
    .map(i => `<rdf:li>${i}</rdf:li>`)
    .join('')}</rdf:Seq></crs:${name}>`;

const alt = (name: string, text: string) =>
  `<crs:${name}><rdf:Alt><rdf:li xml:lang="x-default">${text}</rdf:li></rdf:Alt></crs:${name}>`;

describe('parseXmpPreset fixtures', () => {
  it.each(['clear-natural.xmp', 'film-mood.xmp', 'warm-romantic.xmp'])(
    '%s parses',
    name => {
      const {settings, ignored} = ok(fixture(name));
      expect(settings.toneCurve.master.length).toBeGreaterThan(1);
      expect(settings.hsl.green.saturation).not.toBe(0);
      expect(ignored).toContain('Sharpness');
      expect(ignored).not.toContain('Exposure2012');
      expect(ignored).not.toContain('UUID');
    },
  );

  it('reads Film Mood values', () => {
    const {settings} = ok(fixture('film-mood.xmp'));
    expect(settings).toMatchObject({
      temperature: 10,
      contrast: 18,
      highlights: -45,
      texture: -5,
      grayscale: false,
      grain: {amount: 25, size: 30, frequency: 55},
      vignette: {amount: -20, midpoint: 40, feather: 75, roundness: 0},
      splitToning: {shadowHue: 160, balance: -15},
      midtoneGrade: {hue: 35, saturation: 7},
    });
    expect(settings.toneCurve.master[1]).toEqual([64, 52]);
    expect(settings.hsl.yellow).toEqual({
      hue: -30,
      saturation: -35,
      luminance: -10,
    });
  });
});

describe('parseXmpPreset fields', () => {
  it('attribute and element forms parse equal', () => {
    const asAttrs = xmp(['crs:Contrast2012="+18"', 'crs:Saturation="-5"']);
    const asElements = xmp(
      [],
      [
        '<crs:Contrast2012>+18</crs:Contrast2012>',
        '<crs:Saturation> -5 </crs:Saturation>',
      ],
    );
    expect(ok(asElements)).toEqual(ok(asAttrs));
  });

  it('reads Red/Green/Blue tone curves', () => {
    const {settings} = ok(
      xmp(
        [],
        [
          seq('ToneCurvePV2012', ['0, 10', '255, 242']),
          seq('ToneCurvePV2012Red', ['0, 0', '128, 140']),
          seq('ToneCurvePV2012Green', ['0, 0', '255, 255']),
          seq('ToneCurvePV2012Blue', ['0, 5', '255, 250']),
        ],
      ),
    );
    expect(settings.toneCurve).toEqual({
      master: [
        [0, 10],
        [255, 242],
      ],
      red: [
        [0, 0],
        [128, 140],
      ],
      green: [
        [0, 0],
        [255, 255],
      ],
      blue: [
        [0, 5],
        [255, 250],
      ],
    });
  });

  it('reads ConvertToGrayscale', () => {
    const {settings} = ok(xmp(['crs:ConvertToGrayscale="True"']));
    expect(settings.grayscale).toBe(true);
  });

  it('absolute Temperature/Tint and unshipped fields go to ignored', () => {
    const {settings, ignored} = ok(
      xmp(
        [
          'crs:Contrast2012="5"',
          'crs:Temperature="5500"',
          'crs:Tint="+3"',
          'crs:ParametricShadows="10"',
          'crs:ColorGradeGlobalHue="10"',
          'crs:ColorGradeShadowLum="1"',
          'crs:RedHue="4"',
          'crs:ShadowTint="2"',
          'crs:Sharpness="40"',
          'crs:CameraProfile="Adobe Color"',
        ],
        [
          seq('PointColors', ['-1, -1']),
          seq('MaskGroupBasedCorrections', ['x']),
        ],
      ),
    );
    expect(settings.temperature).toBe(0);
    expect(settings.tint).toBe(0);
    expect(ignored).toEqual([
      'Temperature',
      'Tint',
      'ParametricShadows',
      'ColorGradeGlobalHue',
      'ColorGradeShadowLum',
      'RedHue',
      'ShadowTint',
      'Sharpness',
      'CameraProfile',
      'PointColors',
      'MaskGroupBasedCorrections',
    ]);
  });

  it('bookkeeping fields are skipped silently', () => {
    const {ignored} = ok(
      xmp(
        [
          'crs:Contrast2012="5"',
          'crs:ProcessVersion="15.4"',
          'crs:PresetType="Normal"',
          'crs:UUID="X"',
          'crs:Version="1"',
          'crs:SupportsAmount="True"',
          'crs:SupportsMonochrome="True"',
        ],
        [alt('Name', 'N'), alt('Group', 'G')],
      ),
    );
    expect(ignored).toEqual([]);
  });

  it('accepts a non-crs prefix bound to the namespace', () => {
    const text = xmp(['crs:Contrast2012="5"']).replace(/crs/g, 'cr');
    expect(ok(text).settings.contrast).toBe(5);
  });
});

describe('parseXmpPreset unsupported', () => {
  const other = 'http://example.com/ns/';

  it.each([
    ['.lrtemplate', 's = {\n\tid = "abc",\n\tinternalName = "x",\n}\nreturn s'],
    ['no camera-raw namespace', xmp(['crs:Contrast2012="5"'], [], other)],
    ['profile (RGBTable)', xmp(['crs:RGBTable="abc"'])],
    ['profile (LookTable)', xmp([], ['<crs:LookTable>abc</crs:LookTable>'])],
    ['no shipped field', xmp(['crs:Sharpness="40"'])],
    [
      'shipped fields all default',
      xmp(['crs:Contrast2012="0"', 'crs:ConvertToGrayscale="False"']),
    ],
  ])('%s', (_name, text) => {
    expect(failure(text).reason).toBe('unsupported');
  });

  it('profile detail names profiles', () => {
    expect(failure(xmp(['crs:RGBTable="abc"'])).detail).toMatch(/profile/i);
  });
});

describe('parseXmpPreset unreadable', () => {
  const body = xmp(['crs:Contrast2012="5"']);

  it.each([
    ['empty', ''],
    ['replacement char', `${body}�`],
    ['NUL', `${body}\u0000`],
    ['over 16 MB', `<x:xmpmeta>${' '.repeat(16 * 1024 * 1024)}`],
    ['missing x:xmpmeta', body.replace(/x:xmpmeta/g, 'x:other')],
    ['missing rdf:Description', body.replace(/rdf:Description/g, 'rdf:Other')],
    ['unclosed x:xmpmeta', body.replace('</x:xmpmeta>', '')],
    [
      'unbalanced closing tag',
      body.replace('</rdf:Description>', '</rdf:Other>'),
    ],
    ['unterminated tag', `${body.slice(0, -5)}</x:xmpm`],
    [
      'unterminated attribute',
      body.replace('crs:Contrast2012="5"', 'crs:Contrast2012="5'),
    ],
    ['unquoted attribute', body.replace('"5"', '5')],
    ['non-numeric field', xmp(['crs:Contrast2012="abc"'])],
    ['empty numeric field', xmp(['crs:Contrast2012=""'])],
    ['NaN', xmp(['crs:Contrast2012="NaN"'])],
    ['Infinity', xmp(['crs:Contrast2012="1e999"'])],
    ['bad grayscale', xmp(['crs:ConvertToGrayscale="yes"'])],
    ['bad curve entry', xmp([], [seq('ToneCurvePV2012', ['0, 10', 'a, b'])])],
    [
      'curve entry with 3 numbers',
      xmp([], [seq('ToneCurvePV2012', ['0, 1, 2'])]),
    ],
    [
      'curve as scalar',
      xmp([], ['<crs:ToneCurvePV2012>0, 0</crs:ToneCurvePV2012>']),
    ],
    [
      'numeric field as element tree',
      xmp([], ['<crs:Contrast2012><rdf:Seq/></crs:Contrast2012>']),
    ],
  ])('%s', (_name, text) => {
    expect(failure(text).reason).toBe('unreadable');
  });
});
