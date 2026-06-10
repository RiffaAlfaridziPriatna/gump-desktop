import {Injectable} from '@lib/di';
import {APIAgent} from '../agent';
import {APIResponse} from '../types';

@Injectable()
export class UserResource {
  constructor(private readonly agent: APIAgent) {}

  getAlbums(params?: {cursor?: string}): Promise<APIResponse.AlbumList> {
    return this.agent.requestWithToken('GET', 'albums', params);
  }
}
