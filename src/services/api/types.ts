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

  export type CullingEyeStatus = 'open' | 'closed' | 'partial';
  export type CullingFocusLevel = 'good' | 'soft' | 'blurred';

  export type CullingFace = {
    boundingBox: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    eyeStatus: CullingEyeStatus;
    eyeConfidence: number;
    focusLevel: CullingFocusLevel;
    sharpness: number;
    brightness: number;
    landmarks: Array<{type: string; x: number; y: number}>;
    pose: {pitch: number; roll: number; yaw: number};
    rekognitionFaceId?: string;
  };

  export type CullingPhoto = {
    photoId: string;
    fileName: string;
    faces: CullingFace[];
    selected: boolean;
    aiSelected: boolean;
    maybe: boolean;
    blurred: boolean;
    closedEyes: boolean;
    duplicated: boolean;
    starRating: number | null;
  };

  export type CullingPhotoList = {
    results: CullingPhoto[];
  };

  export type CullingStats = {
    totalPhotos: number;
    mySelections: number;
    aiSelected: number;
    maybe: number;
    blurred: number;
    closedEyes: number;
    duplicated: number;
  };

  export type CullingKeyFace = {
    faceId: string;
    photoIds: string[];
    eyeStatus: CullingEyeStatus;
    focusLevel: CullingFocusLevel;
    occurrenceCount: number;
  };

  export type CullingKeyFaceList = {
    results: CullingKeyFace[];
  };

  export type CullingFinalizeResult = {
    selectedPhotoIds: string[];
  };

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

  export type CreateUploadSession =
    paths['/albums/{albumId}/upload-session']['post']['requestBody']['content']['application/json'];

  export type FinishUploadSession =
    paths['/albums/{albumId}/upload-session']['put']['requestBody']['content']['application/json'];
}
