export namespace APIResponse {
  export type User = {
    id: string;
    email: string;
    name: string;
    role: 'creator' | 'customer';
    language: 'en' | 'vi' | 'zh' | 'id' | 'ja';
    subdomain: string;
    details: {
      profilePhoto: string | null;
      coverPhoto: string | null;
    };
  };

  export type Guest = {
    id: string;
    role: 'guest';
  };

  export type UserToken = {
    token: string;
    user: User;
  };

  export type List = {
    next: string | null;
    previous: string | null;
  };

  export type FilePreview = {
    url: string;
  };

  export type AlbumCover = {
    preview: {
      large: FilePreview;
    };
    focalPoint: {
      x: number;
      y: number;
    };
  } | null;

  export type Album = {
    id: string;
    name: string;
    title: string | null;
    slug: string;
    cover: AlbumCover;
    totalMediaCount: number;
    size: number;
    createdAt: string;
  };

  export type AlbumList = List & {
    results: Album[];
    count: number;
  };

  export type CulledAlbum = {
    id: string;
    name: string;
    title: string | null;
    slug: string;
    cover: AlbumCover;
    totalMediaCount: number;
    size: number;
    createdAt: string;
    forCulling: true;
    cullingHasUploads: boolean;
    cullingCompleted: boolean;
  };

  export type CulledAlbumList = List & {
    results: CulledAlbum[];
    count: number;
  };

  export type Status = {
    success: boolean;
  };
}

export namespace APIRequest {
  export type Login = {
    email: string;
    password: string;
  };

  export type GetAlbumList = {
    cursor?: string;
    keyword?: string;
    year?: number;
    month?: number;
    sort?: 'default' | 'creation_time' | 'size';
    order?: 'asc' | 'desc';
  };

  export type GetCulledAlbumList = {
    cursor?: string;
    keyword?: string;
    year?: number;
    month?: number;
    sort?: 'default' | 'creation_time' | 'size';
    order?: 'asc' | 'desc';
    forCulling?: boolean;
  };

  export type CreateCulledAlbum = {
    name: string;
    title?: string;
    forCulling?: boolean;
  };

  export type UpdateCullingStatus = {
    cullingCompleted: boolean;
  };
}
