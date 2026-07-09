import {Injectable} from '@di/tsyringe';
import {FileAsset, getFileContentType} from '@services/upload/types';
import {uploadPartFromFile} from '@services/upload/multipart';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';

const UPLOAD_PART_BATCH_SIZE = 4;

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
    let completedParts = 0;

    for (let index = 0; index < session.parts.length; index += UPLOAD_PART_BATCH_SIZE) {
      const batch = session.parts.slice(index, index + UPLOAD_PART_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async part => {
          const uploaded = await uploadPartFromFile(data.file.uri, part);
          completedParts++;
          onProgress(Math.floor((completedParts / session.parts.length) * 100));
          return uploaded;
        }),
      );
      uploadedParts.push(...batchResults);
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
