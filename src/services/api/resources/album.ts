import {Injectable} from '@lib/di';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';

@Injectable()
export class AlbumResource {
  constructor(private readonly agent: APIAgent) {}

  getAll(query?: APIRequest.GetAlbumList): Promise<APIResponse.AlbumList> {
    return this.agent.requestWithToken('GET', 'albums', query);
  }
}
