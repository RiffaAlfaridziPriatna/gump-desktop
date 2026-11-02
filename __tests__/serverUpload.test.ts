import {APIException} from '../src/services/api/exception';
import {uploadServerPhoto} from '../src/lib/culledAlbum/serverUpload';
import {classifyUploadError} from '../src/lib/culledAlbum/formatUploadError';
import {resolveUploadFileAsset} from '../src/lib/culledAlbum/resolveUploadFileAsset';
import {getPhotoById, updatePhoto} from '../src/lib/culledAlbum/store';

const mockUpload = jest.fn();
const mockUseCase = {
  startUpload: jest.fn(),
  updateProgress: jest.fn(),
  markUploaded: jest.fn(),
};

jest.mock('@di/useCases', () => ({
  resolveUseCases: () => ({uploadSelectedPhotos: mockUseCase}),
}));
jest.mock('@di/tsyringe', () => ({
  make: () => ({media: {upload: (...args: unknown[]) => mockUpload(...args)}}),
}));
jest.mock('@services/api', () => ({
  ...jest.requireActual('../src/services/api/exception'),
  APIService: class {},
}));
jest.mock('@lib/look/uploadLookBake', () => ({getBakedUploadFile: jest.fn()}));
jest.mock('../src/lib/culledAlbum/resolveUploadFileAsset', () => ({
  resolveUploadFileAsset: jest.fn(photo => photo.file),
}));
jest.mock('../src/lib/culledAlbum/store', () => ({
  getPhotoById: jest.fn(),
  updatePhoto: jest.fn(),
}));

type Photo = {
  photoId: string;
  file: {uri: string};
  serverUploadStatus: string;
  serverUploadProgress: number;
  serverUploadError?: string;
};

let photo: Photo;

beforeEach(() => {
  jest.clearAllMocks();
  photo = {
    photoId: 'p1',
    file: {uri: 'file:///a.jpg'},
    serverUploadStatus: 'pending',
    serverUploadProgress: 0,
  };
  (getPhotoById as jest.Mock).mockImplementation(() => photo);
  (updatePhoto as jest.Mock).mockImplementation((_a, _p, updater) => {
    updater(photo);
    return true;
  });
});

const api = (status: number) => new APIException(status, 'E', 'x', undefined);

describe('uploadServerPhoto', () => {
  it('settles as uploaded on success', async () => {
    mockUpload.mockResolvedValue(undefined);
    await uploadServerPhoto('a1', 'p1');
    expect(photo.serverUploadStatus).toBe('uploaded');
    expect(mockUseCase.markUploaded).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 5xx and then settles as uploaded', async () => {
    mockUpload.mockRejectedValueOnce(api(503)).mockResolvedValueOnce(undefined);
    await uploadServerPhoto('a1', 'p1');
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(photo.serverUploadStatus).toBe('uploaded');
  });

  it('does not retry a 4xx', async () => {
    mockUpload.mockRejectedValue(api(400));
    await expect(uploadServerPhoto('a1', 'p1')).rejects.toBeInstanceOf(
      APIException,
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 5xx once the photo is already failed', async () => {
    mockUpload.mockImplementation(() => {
      photo.serverUploadStatus = 'failed';
      return Promise.reject(api(503));
    });
    await expect(uploadServerPhoto('a1', 'p1')).rejects.toBeInstanceOf(
      APIException,
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(photo.serverUploadStatus).toBe('failed');
  });

  it('does not overwrite a failed photo when a stale attempt succeeds', async () => {
    mockUpload.mockImplementation(() => {
      photo.serverUploadStatus = 'failed';
      return Promise.resolve();
    });
    await uploadServerPhoto('a1', 'p1');
    expect(photo.serverUploadStatus).toBe('failed');
    expect(mockUseCase.markUploaded).not.toHaveBeenCalled();
  });

  it('throws sourceMissing (final) when the source cannot be resolved', async () => {
    (resolveUploadFileAsset as jest.Mock).mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const failure = await uploadServerPhoto('a1', 'p1').catch(err => err);
    expect(classifyUploadError(failure)).toBe('sourceMissing');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('throws sourceMissing when the photo record is gone', async () => {
    (getPhotoById as jest.Mock).mockReturnValue(undefined);
    const failure = await uploadServerPhoto('a1', 'p1').catch(err => err);
    expect(classifyUploadError(failure)).toBe('sourceMissing');
  });
});
