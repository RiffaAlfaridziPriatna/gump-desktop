import type {components, paths} from './generated-schema';

export namespace APIResponse {
  export type UserDetails = components['schemas']['ProfileInfoFullDto'];

  export type User = Omit<
    components['schemas']['ProfileFullDto'],
    'role' | 'details'
  > & {
    role: 'creator' | 'customer';
    details: UserDetails;
  };

  export type UserToken = Omit<
    components['schemas']['ProfileTokenDto'],
    'user'
  > & {
    user: User;
  };

  export type Guest = Omit<components['schemas']['UserBasicDto'], 'role'> & {
    role: 'guest';
  };

  export type List = {
    next: string | null;
    previous: string | null;
  };

  export type FilePreview = components['schemas']['FilePreviewDto'];
  export type AlbumCover = components['schemas']['AlbumCoverDto'] | null;

  export type Album = components['schemas']['AlbumWithCountsDto'];
  export type AlbumList = components['schemas']['AlbumListBasicDto'];

  export type CulledAlbum = components['schemas']['AlbumWithCountsDto'];
  export type CulledAlbumList = components['schemas']['AlbumListBasicDto'];
  export type CulledAlbumCreateResult = components['schemas']['AlbumFullDto'];
  export type CulledAlbumUpdateResult = components['schemas']['AlbumBasicDto'];

  export type UploadPart = components['schemas']['S3UploadPartDto'];
  export type UploadSession = components['schemas']['S3MultipartUploadDto'];
  export type UploadedPart = {
    num: number;
    eTag: string;
  };
  export type Status = components['schemas']['StatusDto'];
}

export namespace APIRequest {
  export type Login = {
    email: string;
    password: string;
  };

  export type GetAlbumList = NonNullable<
    paths['/albums']['get']['parameters']['query']
  >;

  export type GetCulledAlbumList = GetAlbumList;

  export type CreateCulledAlbum =
    paths['/albums']['post']['requestBody']['content']['application/json'];

  export type UpdateCullingStatus =
    paths['/albums/{albumId}/culling-status']['patch']['requestBody']['content']['application/json'];

  export type CreateUploadSession =
    paths['/albums/{albumId}/upload-session']['post']['requestBody']['content']['application/json'];

  export type FinishUploadSession =
    paths['/albums/{albumId}/upload-session']['put']['requestBody']['content']['application/json'];
}
