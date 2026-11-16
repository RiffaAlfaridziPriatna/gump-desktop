import {readFileSync} from 'fs';
import {join} from 'path';
import {setAlbumCustomLook} from '../src/lib/culledAlbum/store';
import {importAlbumPreset} from '../src/lib/look/importAlbumPreset';
import {pickLookPresetFile} from '../src/lib/media/filePicker';
import {captureAppEvent} from '../src/lib/observability/posthogClient';
import {reportError} from '../src/lib/observability/reportError';
import {
  deleteLocalPhotoFile,
  writeAlbumLookFile,
} from '../src/lib/storage/localStorage';

jest.mock('../src/lib/culledAlbum/store', () => ({
  setAlbumCustomLook: jest.fn(),
}));
jest.mock('../src/lib/media/filePicker', () => ({
  pickLookPresetFile: jest.fn(),
}));
jest.mock('../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
}));
jest.mock('../src/lib/observability/reportError', () => ({
  reportError: jest.fn(),
}));
jest.mock('../src/lib/storage/localStorage', () => ({
  ...jest.requireActual('../src/lib/storage/localStorage'),
  writeAlbumLookFile: jest.fn(),
  deleteLocalPhotoFile: jest.fn(),
}));

const ALBUM = 'album-1';
const LOOKS_DIR = '/root/culling-albums/album-1/looks/';
const IDENTITY_CUBE = [
  'TITLE "x"',
  'LUT_3D_SIZE 2',
  '0 0 0',
  '1 0 0',
  '0 1 0',
  '1 1 0',
  '0 0 1',
  '1 0 1',
  '0 1 1',
  '1 1 1',
].join('\n');
const XMP = readFileSync(
  join(__dirname, 'fixtures/presets', 'film-mood.xmp'),
  'utf8',
);

const pick = pickLookPresetFile as jest.Mock;
const write = writeAlbumLookFile as jest.Mock;
const save = setAlbumCustomLook as jest.Mock;
const remove = deleteLocalPhotoFile as jest.Mock;
const report = reportError as jest.Mock;

function givenFile(name: string, text: string, size = text.length): void {
  pick.mockResolvedValue({uri: `file:///picked/${name}`, name, size});
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  }) as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  write.mockImplementation((_album: string, fileName: string) =>
    Promise.resolve(`${LOOKS_DIR}${fileName}`),
  );
  save.mockResolvedValue(null);
  remove.mockResolvedValue(undefined);
});

describe('importAlbumPreset', () => {
  it('imports a .cube with the file name label and no finishing', async () => {
    givenFile('My Look.v2.cube', IDENTITY_CUBE);
    const result = await importAlbumPreset(ALBUM);
    expect(result.status).toBe('imported');
    const saved = save.mock.calls[0][1];
    expect(saved).toEqual({
      name: 'My Look.v2',
      revision: expect.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
      finishing: null,
    });
    const [albumId, fileName, text] = write.mock.calls[0];
    expect(albumId).toBe(ALBUM);
    expect(fileName).toBe(`custom-${saved.revision}.cube`);
    expect(text.startsWith('LUT_3D_SIZE 2\n')).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('imports an .xmp through the engine with finishing', async () => {
    givenFile('Film.xmp', XMP);
    const result = await importAlbumPreset(ALBUM);
    expect(result.status).toBe('imported');
    expect(write.mock.calls[0][2]).toContain('LUT_3D_SIZE 33\n');
    expect(save.mock.calls[0][1].name).toBe('Film');
    expect(save.mock.calls[0][1].finishing).not.toBeNull();
  });

  it('gives each import a new revision and deletes the replaced file', async () => {
    givenFile('a.cube', IDENTITY_CUBE);
    await importAlbumPreset(ALBUM);
    const first = save.mock.calls[0][1];
    save.mockResolvedValueOnce(first);
    await importAlbumPreset(ALBUM);
    const second = save.mock.calls[1][1];
    expect(second.revision).not.toBe(first.revision);
    expect(remove).toHaveBeenCalledWith(
      `${LOOKS_DIR}custom-${first.revision}.cube`,
    );
  });

  it('returns cancelled without logging when the picker is dismissed', async () => {
    pick.mockResolvedValue(null);
    await expect(importAlbumPreset(ALBUM)).resolves.toEqual({
      status: 'cancelled',
    });
    expect(report).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ['preset.lrtemplate', 'x', 'unsupported'],
    ['bad.cube', 'LUT_1D_SIZE 2\n0 0 0\n1 1 1', 'unsupported'],
    ['empty.cube', '   ', 'unreadable'],
    ['short.cube', 'LUT_3D_SIZE 2\n0 0 0', 'unreadable'],
    ['broken.xmp', '<x:xmpmeta><rdf', 'unreadable'],
    [
      'no-crs.xmp',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description/></rdf:RDF></x:xmpmeta>',
      'unsupported',
    ],
  ])('%s fails as %s, keeps the old preset, logs once', async (name, text, reason) => {
    givenFile(name, text);
    const result = await importAlbumPreset(ALBUM);
    expect(result).toEqual({status: 'failed', reason});
    expect(save).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    const context = report.mock.calls[0][1];
    expect(context).toMatchObject({albumId: ALBUM, reason});
    expect(JSON.stringify(context)).not.toContain('/picked/');
  });

  it('rejects a file over 16 MB before reading it', async () => {
    givenFile('big.cube', IDENTITY_CUBE, 16 * 1024 * 1024 + 1);
    const result = await importAlbumPreset(ALBUM);
    expect(result).toEqual({status: 'failed', reason: 'unreadable'});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps a native write failure to unreadable', async () => {
    givenFile('a.cube', IDENTITY_CUBE);
    write.mockRejectedValue(new Error('disk'));
    const result = await importAlbumPreset(ALBUM);
    expect(result).toEqual({status: 'failed', reason: 'unreadable'});
    expect(save).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({step: 'write', reason: 'unreadable'}),
    );
  });

  it('deletes the new file when saving the album fails', async () => {
    givenFile('a.cube', IDENTITY_CUBE);
    save.mockRejectedValue(new Error('sqlite'));
    const result = await importAlbumPreset(ALBUM);
    expect(result).toEqual({status: 'failed', reason: 'unreadable'});
    const fileName = write.mock.calls[0][1];
    expect(remove).toHaveBeenCalledWith(`${LOOKS_DIR}${fileName}`);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('maps a picker failure to unreadable', async () => {
    pick.mockRejectedValue(new Error('no picker'));
    const result = await importAlbumPreset(ALBUM);
    expect(result).toEqual({status: 'failed', reason: 'unreadable'});
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('logs ignored .xmp fields once per import', async () => {
    givenFile(
      'masked.xmp',
      XMP.replace('crs:Exposure2012', 'crs:SharpenRadius="1.0" crs:Exposure2012'),
    );
    await importAlbumPreset(ALBUM);
    expect(captureAppEvent).toHaveBeenCalledTimes(1);
    expect(captureAppEvent).toHaveBeenCalledWith(
      'look_preset_fields_ignored',
      expect.objectContaining({albumId: ALBUM}),
    );
  });
});
