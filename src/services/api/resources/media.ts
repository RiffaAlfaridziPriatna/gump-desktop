import {Injectable} from '@lib/di';
import {
  FileAsset,
  getFileContentType,
  readFileSlice,
} from '@services/upload/types';
import {uploadPart} from '@services/upload/multipart';
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

    let progress = 0;
    const batchSize = 4;
    const uploadedParts: APIResponse.UploadedPart[] = [];

    for (let i = 0; i < session.parts.length; i += batchSize) {
      const batch = session.parts.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async part => {
          const body = await readFileSlice(
            data.file.uri,
            part.start,
            part.end,
          );
          const uploaded = await uploadPart(part, body);
          progress++;
          onProgress(Math.floor((progress / session.parts.length) * 100));
          return uploaded;
        }),
      );

      uploadedParts.push(...batchResults);
    }

    await this.agent.requestWithToken('PUT', `albums/${data.albumId}/upload-session`, {
      uploadId: session.uploadId,
      key: session.key,
      parts: uploadedParts,
    } satisfies APIRequest.FinishUploadSession);
  }
}
