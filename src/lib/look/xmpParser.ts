import {
  BOOKKEEPING,
  CURVE_FIELDS,
  defaultSettings,
  GRAYSCALE_FIELD,
  NUMBER_FIELDS,
  PROFILE_TABLES,
  type CurvePoint,
  type DevelopSettings,
} from './developSettings';
import {
  checkTextInput,
  fail,
  toFiniteNumber,
  type ParseFailure,
} from './cubeParser';
import {findNamespacePrefix, parseXml, XmlError, type XmlNode} from './miniXml';

export const CRS_NAMESPACE = 'http://ns.adobe.com/camera-raw-settings/1.0/';

export type {CurvePoint, DevelopSettings, HslColor} from './developSettings';
export {HSL_COLORS} from './developSettings';

export type XmpParseResult =
  | {ok: true; settings: DevelopSettings; ignored: string[]}
  | ParseFailure;

type RawField = {name: string; scalar?: string; list?: string[]};

function collectFields(description: XmlNode, prefix: string): RawField[] {
  const tag = `${prefix}:`;
  const fields: RawField[] = [];
  for (const [key, value] of Object.entries(description.attrs)) {
    if (key.startsWith(tag)) {
      fields.push({name: key.slice(tag.length), scalar: value});
    }
  }
  for (const child of description.children) {
    if (!child.name.startsWith(tag)) {
      continue;
    }
    const name = child.name.slice(tag.length);
    const seq = child.children.find(c => c.name === 'rdf:Seq');
    if (seq) {
      fields.push({name, list: seq.children.map(li => li.text.trim())});
    } else if (child.children.length === 0) {
      fields.push({name, scalar: child.text.trim()});
    } else {
      fields.push({name});
    }
  }
  return fields;
}

const MAX_CRS_FIELDS = 2000;
const MAX_CURVE_POINTS = 256;

function parseCurve(items: string[]): CurvePoint[] | null {
  if (items.length > MAX_CURVE_POINTS) {
    return null;
  }
  const points: CurvePoint[] = [];
  for (const item of items) {
    const parts = item.split(',').map(p => p.trim());
    const x = parts.length === 2 ? toFiniteNumber(parts[0]) : null;
    const y = parts.length === 2 ? toFiniteNumber(parts[1]) : null;
    if (x === null || y === null || x < 0 || x > 255 || y < 0 || y > 255) {
      return null;
    }
    if (points.length > 0 && x <= points[points.length - 1][0]) {
      return null;
    }
    points.push([x, y]);
  }
  return points;
}

function applyField(
  settings: DevelopSettings,
  field: RawField,
): ParseFailure | null {
  const {name} = field;
  const setNumber = NUMBER_FIELDS.get(name);
  if (setNumber) {
    const value =
      field.scalar === undefined ? null : toFiniteNumber(field.scalar);
    if (value === null) {
      return fail('unreadable', `${name} is not a finite number.`);
    }
    setNumber(settings, value);
    return null;
  }
  if (name === GRAYSCALE_FIELD) {
    if (field.scalar !== 'True' && field.scalar !== 'False') {
      return fail('unreadable', `${name} must be True or False.`);
    }
    settings.grayscale = field.scalar === 'True';
    return null;
  }
  const curveKey = CURVE_FIELDS.get(name);
  if (curveKey) {
    const points = field.list ? parseCurve(field.list) : null;
    if (points === null) {
      return fail(
        'unreadable',
        `${name} must be at most ${MAX_CURVE_POINTS} increasing "x, y" points in 0..255.`,
      );
    }
    settings.toneCurve[curveKey] = points;
  }
  return null;
}

function topLevelDescriptions(root: XmlNode): XmlNode[] | null {
  const metas = root.children.filter(c => c.name === 'x:xmpmeta');
  const descriptions = metas
    .flatMap(m => m.children.filter(c => c.name === 'rdf:RDF'))
    .flatMap(rdf => rdf.children.filter(c => c.name === 'rdf:Description'));
  return metas.length > 0 && descriptions.length > 0 ? descriptions : null;
}

/**
 * A preset is usable when any shipped field differs from its default
 * (defaultSettings). Only top-level rdf:Description blocks are read; nested
 * ones belong to creative profiles (crs:Look) and are reported as ignored.
 */
export function parseXmpPreset(text: string): XmpParseResult {
  const rejected = checkTextInput(text);
  if (rejected) {
    return rejected;
  }
  if (/^\s*s\s*=\s*\{/.test(text)) {
    return fail('unsupported', '.lrtemplate presets are not supported.');
  }

  let root: XmlNode;
  try {
    root = parseXml(text);
  } catch (error) {
    if (error instanceof XmlError) {
      return fail('unreadable', `Malformed XML: ${error.message}`);
    }
    throw error;
  }

  const prefix = findNamespacePrefix(root, CRS_NAMESPACE);
  if (prefix === null) {
    return fail('unsupported', 'Not a Camera Raw settings preset.');
  }
  const descriptions = topLevelDescriptions(root);
  if (descriptions === null) {
    return fail('unreadable', 'x:xmpmeta or rdf:Description is missing.');
  }
  const fields = descriptions.flatMap(d => collectFields(d, prefix));
  if (fields.length > MAX_CRS_FIELDS) {
    return fail('unreadable', 'The preset has too many fields.');
  }

  const settings = defaultSettings();
  const ignored = new Set<string>();
  let hasProfileTable = false;
  for (const field of fields) {
    const failure = applyField(settings, field);
    if (failure) {
      return failure;
    }
    hasProfileTable = hasProfileTable || PROFILE_TABLES.includes(field.name);
    const shipped =
      NUMBER_FIELDS.has(field.name) ||
      CURVE_FIELDS.has(field.name) ||
      field.name === GRAYSCALE_FIELD;
    if (
      !shipped &&
      !BOOKKEEPING.has(field.name) &&
      !field.name.startsWith('Supports')
    ) {
      ignored.add(field.name);
    }
  }

  // Native finishing draws only a darkening vignette, so a white one is dropped.
  if (settings.vignette.amount > 0) {
    settings.vignette.amount = 0;
    ignored.add('PostCropVignetteAmount');
  }

  const changed =
    JSON.stringify(settings) !== JSON.stringify(defaultSettings());
  if (!changed) {
    return fail(
      'unsupported',
      hasProfileTable
        ? 'Profile presets are not supported.'
        : 'The preset sets no supported adjustments.',
    );
  }
  return {ok: true, settings, ignored: [...ignored]};
}
