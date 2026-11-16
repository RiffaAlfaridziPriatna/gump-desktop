import {parseXmpPreset} from '@lib/look/xmpParser';

const NS = 'http://ns.adobe.com/camera-raw-settings/1.0/';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

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

describe('parseXmpPreset hardening', () => {
  const look =
    '<crs:Look><rdf:Description crs:ConvertToGrayscale="True"><crs:Parameters>' +
    '<rdf:Description crs:Contrast2012="40">' +
    seq('ToneCurvePV2012', ['0, 0', '255, 200']) +
    '</rdf:Description></crs:Parameters></rdf:Description></crs:Look>';

  it('does not read nested crs:Look descriptions', () => {
    const {settings, ignored} = ok(xmp(['crs:Saturation="5"'], [look]));
    expect(settings.grayscale).toBe(false);
    expect(settings.contrast).toBe(0);
    expect(settings.toneCurve.master).toEqual([]);
    expect(ignored).toEqual(['Look']);
  });

  it('a profile with only nested sliders is unsupported', () => {
    const text = xmp(['crs:RGBTable="abc"'], [look]);
    expect(failure(text).detail).toMatch(/profile/i);
  });

  it('too many fields is unreadable', () => {
    const attrs = Array.from({length: 2001}, (_, i) => `crs:F${i}="1"`);
    expect(failure(xmp(attrs)).reason).toBe('unreadable');
  });

  it('many repeated ignored fields are reported once', () => {
    const attrs = ['crs:Contrast2012="5"', 'crs:Sharpness="1"'];
    const elements = Array(50).fill('<crs:Sharpness>2</crs:Sharpness>');
    expect(ok(xmp(attrs, elements)).ignored).toEqual(['Sharpness']);
  });

  it.each([
    [
      'vignette midpoint at its default 50',
      'crs:PostCropVignetteMidpoint="50"',
    ],
    ['grain size at its default 25', 'crs:GrainSize="25"'],
    ['grain frequency at its default 50', 'crs:GrainFrequency="50"'],
  ])('%s is not a change', (_name, attr) => {
    expect(failure(xmp([attr])).reason).toBe('unsupported');
  });

  it('a non-default vignette midpoint is a change', () => {
    expect(ok(xmp(['crs:PostCropVignetteMidpoint="40"'])).ok).toBe(true);
  });

  it('truncates a long tag name in the malformed XML detail', () => {
    const detail = failure(`<x:xmpmeta></${'a'.repeat(1000)}>`).detail;
    expect(detail.length).toBeLessThan(120);
  });

  it.each([
    ['x below 0', ['-1, 0', '10, 10']],
    ['y above 255', ['0, 256']],
    ['x not increasing', ['10, 10', '10, 20']],
    ['x decreasing', ['10, 10', '5, 20']],
    ['more than 256 points', Array.from({length: 257}, (_, i) => `${i}, ${i}`)],
  ])('curve %s is unreadable', (_name, items) => {
    expect(failure(xmp([], [seq('ToneCurvePV2012', items)])).reason).toBe(
      'unreadable',
    );
  });
});

describe('positive post-crop vignette', () => {
  it('drops a white vignette and reports it as ignored', () => {
    const {settings, ignored} = ok(
      xmp(['crs:PostCropVignetteAmount="30"', 'crs:Clarity2012="10"']),
    );
    expect(settings.vignette.amount).toBe(0);
    expect(ignored).toContain('PostCropVignetteAmount');
  });

  it('keeps a darkening vignette', () => {
    const {settings, ignored} = ok(xmp(['crs:PostCropVignetteAmount="-30"']));
    expect(settings.vignette.amount).toBe(-30);
    expect(ignored).not.toContain('PostCropVignetteAmount');
  });
});
