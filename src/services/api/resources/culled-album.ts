import {Injectable} from '@lib/di';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';

@Injectable()
export class CulledAlbumResource {
  constructor(private readonly agent: APIAgent) {}

  getAll(
    query?: Omit<APIRequest.GetCulledAlbumList, 'forCulling'>,
  ): Promise<APIResponse.CulledAlbumList> {
    return this.agent.requestWithToken('GET', 'albums', {
      ...query,
      forCulling: true,
    });
  }

  create(data: APIRequest.CreateCulledAlbum): Promise<APIResponse.CulledAlbum> {
    return this.agent.requestWithToken('POST', 'albums', {
      ...data,
      forCulling: true,
    });
  }

  updateCullingStatus(
    albumId: string,
    data: APIRequest.UpdateCullingStatus,
  ): Promise<APIResponse.CulledAlbum> {
    return this.agent.requestWithToken(
      'PATCH',
      `albums/${albumId}/culling-status`,
      data,
    );
  }

  async delete(albumId: string): Promise<boolean> {
    const response = await this.agent.requestWithToken<APIResponse.Status>(
      'DELETE',
      `albums/${albumId}`,
    );
    return response.success;
  }
}
