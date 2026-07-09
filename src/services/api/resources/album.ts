import {Injectable} from '@di/tsyringe';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';

@Injectable()
export class AlbumResource {
  constructor(private readonly agent: APIAgent) {}

  getAll(query?: APIRequest.GetAlbumList): Promise<APIResponse.AlbumList> {
    return this.agent.requestWithTokenAndCursor('GET', 'albums', query);
  }

  getByIds(ids: string[]): Promise<APIResponse.AlbumList> {
    if (ids.length === 0) {
      return Promise.resolve({
        next: null,
        previous: null,
        results: [],
        count: 0,
      });
    }
    return this.agent.requestWithTokenAndCursor('GET', 'albums', {
      ids: ids.join(','),
    });
  }
}
