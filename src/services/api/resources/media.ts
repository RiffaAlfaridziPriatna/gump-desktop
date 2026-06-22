import {Injectable} from '@lib/di';
import {FileAsset, getFileContentType} from '@services/upload/types';
import {uploadPartFromFile} from '@services/upload/multipart';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';

@Injectable()
export class MediaResource {
  constructor(private readonly agent: APIAgent) {}

  async upload(
    data: {
      file: FileAsset;
      albumId: string;
      folderId?: string;
      mediaId?: string;
      uploaderName?: string;
    },
    onProgress: (progress: number) => void,
  ) {
    const session = await this.agent.requestWithToken<APIResponse.UploadSession>(
      'POST',
      `albums/${data.albumId}/upload-session`,
      {
        contentType: getFileContentType(data.file),
        filename: data.file.name,
        size: data.file.size,
        uploaderName: data.uploaderName,
        folder: data.folderId,
        media: data.mediaId,
      } satisfies APIRequest.CreateUploadSession,
    );

    const uploadedParts: APIResponse.UploadedPart[] = [];

    for (let index = 0; index < session.parts.length; index++) {
      const part = session.parts[index];
      uploadedParts.push(await uploadPartFromFile(data.file.uri, part));
      onProgress(Math.floor(((index + 1) / session.parts.length) * 100));
    }

    await this.agent.requestWithToken(
      'PUT',
      `albums/${data.albumId}/upload-session`,
      {
        uploadId: session.uploadId,
        key: session.key,
        parts: uploadedParts.sort((a, b) => a.num - b.num),
      } satisfies APIRequest.FinishUploadSession,
    );
  }
}
