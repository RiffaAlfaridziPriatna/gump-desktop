import {NativeModules} from 'react-native';

function base64Of(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

describe('decodeBase64Utf8', () => {
  const {decodeBase64Utf8} = jest.requireActual(
    '../src/lib/storage/localStorage',
  );

  it('decodes multi-byte UTF-8', () => {
    expect(decodeBase64Utf8(Buffer.from('Café — ok').toString('base64'))).toBe(
      'Café — ok',
    );
  });

  it('drops a leading BOM', () => {
    expect(decodeBase64Utf8(base64Of([0xef, 0xbb, 0xbf, 0x3c, 0x78]))).toBe(
      '<x',
    );
  });

  it('throws on invalid UTF-8', () => {
    expect(() => decodeBase64Utf8(base64Of([0xc3, 0x28]))).toThrow(URIError);
  });
});

describe('readLocalTextFile', () => {
  it('reads through native readFileSlice, not fetch', async () => {
    const readFileSlice = jest.fn().mockResolvedValue({
      data: Buffer.from('<x:xmpmeta/>').toString('base64'),
      size: 12,
    });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const original = NativeModules.GumpLocalStorage;
    NativeModules.GumpLocalStorage = {readFileSlice};
    try {
      let read!: (uri: string, size: number) => Promise<string>;
      jest.isolateModules(() => {
        read = require('../src/lib/storage/localStorage').readLocalTextFile;
      });
      const uri = 'C:\\Users\\me\\Downloads\\a b.xmp';
      await expect(read(uri, 12)).resolves.toBe('<x:xmpmeta/>');
      expect(readFileSlice).toHaveBeenCalledWith(uri, 0, 12);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      NativeModules.GumpLocalStorage = original;
    }
  });
});
