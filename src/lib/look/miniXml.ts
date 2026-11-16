import {clip} from './cubeParser';

const MAX_DEPTH = 64;

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

export class XmlError extends Error {}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function indexAfter(text: string, marker: string, from: number): number {
  const at = text.indexOf(marker, from);
  if (at < 0) {
    throw new XmlError(`Unterminated markup, expected ${marker}.`);
  }
  return at + marker.length;
}

function readTag(
  text: string,
  start: number,
): {node: XmlNode; end: number; selfClosing: boolean} {
  let i = start;
  while (i < text.length && !isSpace(text[i]) && !'/>'.includes(text[i])) {
    i++;
  }
  const node: XmlNode = {
    name: text.slice(start, i),
    attrs: {},
    children: [],
    text: '',
  };
  if (node.name === '') {
    throw new XmlError('A tag has no name.');
  }
  for (;;) {
    while (i < text.length && isSpace(text[i])) {
      i++;
    }
    if (i >= text.length) {
      throw new XmlError(`Unterminated tag ${clip(node.name)}.`);
    }
    if (text[i] === '>') {
      return {node, end: i + 1, selfClosing: false};
    }
    if (text[i] === '/') {
      if (text[i + 1] !== '>') {
        throw new XmlError(`Malformed tag ${clip(node.name)}.`);
      }
      return {node, end: i + 2, selfClosing: true};
    }
    const nameStart = i;
    while (i < text.length && !isSpace(text[i]) && text[i] !== '=') {
      i++;
    }
    const attr = text.slice(nameStart, i);
    while (i < text.length && isSpace(text[i])) {
      i++;
    }
    if (text[i] !== '=') {
      throw new XmlError(`Attribute ${clip(attr)} has no value.`);
    }
    i++;
    while (i < text.length && isSpace(text[i])) {
      i++;
    }
    const quote = text[i];
    if (quote !== '"' && quote !== "'") {
      throw new XmlError(`Attribute ${clip(attr)} is not quoted.`);
    }
    const close = text.indexOf(quote, i + 1);
    if (close < 0) {
      throw new XmlError(`Attribute ${clip(attr)} is unterminated.`);
    }
    node.attrs[attr] = text.slice(i + 1, close);
    i = close + 1;
  }
}

// Not a full XML parser: no entity decoding, DTDs skipped, no namespace
// resolution. Enough for Camera Raw presets.
export function parseXml(text: string): XmlNode {
  const root: XmlNode = {name: '#root', attrs: {}, children: [], text: ''};
  const stack = [root];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += text.slice(i);
      break;
    }
    top.text += text.slice(i, lt);
    if (text.startsWith('<!--', lt)) {
      i = indexAfter(text, '-->', lt + 4);
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = indexAfter(text, ']]>', lt + 9);
      top.text += text.slice(lt + 9, end - 3);
      i = end;
    } else if (text.startsWith('<?', lt)) {
      i = indexAfter(text, '?>', lt + 2);
    } else if (text.startsWith('<!', lt)) {
      i = indexAfter(text, '>', lt + 2);
    } else if (text.startsWith('</', lt)) {
      const end = indexAfter(text, '>', lt + 2);
      const name = text.slice(lt + 2, end - 1).trim();
      if (stack.length === 1 || top.name !== name) {
        throw new XmlError(`Unbalanced closing tag ${clip(name)}.`);
      }
      stack.pop();
      i = end;
    } else {
      const {node, end, selfClosing} = readTag(text, lt + 1);
      top.children.push(node);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) {
          throw new XmlError('The document is nested too deeply.');
        }
        stack.push(node);
      }
      i = end;
    }
  }
  if (stack.length !== 1) {
    throw new XmlError(
      `Tag ${clip(stack[stack.length - 1].name)} is never closed.`,
    );
  }
  return root;
}

export function findNamespacePrefix(
  node: XmlNode,
  namespace: string,
): string | null {
  for (const [key, value] of Object.entries(node.attrs)) {
    if (key.startsWith('xmlns:') && value === namespace) {
      return key.slice('xmlns:'.length);
    }
  }
  for (const child of node.children) {
    const found = findNamespacePrefix(child, namespace);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
