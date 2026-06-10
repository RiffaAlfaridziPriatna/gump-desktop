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

  export type Album = {
    id: string;
    name: string;
    title: string;
    coverPhoto: string | null;
    mediaCount: number;
    createdAt: string;
  };

  export type AlbumList = List & {
    results: Album[];
  };
}

export namespace APIRequest {
  export type Login = {
    email: string;
    password: string;
  };
}
