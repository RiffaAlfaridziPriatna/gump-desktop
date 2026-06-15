import {Injectable, Container} from '@lib/di';
import {API_BASE_URL} from '@lib/constants';
import {APIAgent} from './agent';
import {AlbumResource} from './resources/album';
import {CulledAlbumResource} from './resources/culled-album';
import {AuthResource} from './resources/auth';
import {UserResource} from './resources/user';

export {APIException, assertAPIException, flattenValidationErrors} from './exception';
export type {APIRequest, APIResponse} from './types';
export type {FileAsset} from '@services/upload/types';

@Injectable()
export class APIService {
  constructor(
    readonly agent: APIAgent,
    readonly auth: AuthResource,
    readonly user: UserResource,
    readonly album: AlbumResource,
    readonly culledAlbum: CulledAlbumResource,
  ) {}
}

Container.afterResolution(APIService, (_token, instances) => {
  const list = Array.isArray(instances) ? instances : [instances];
  list.forEach(instance => {
    instance.agent.baseUrl = API_BASE_URL;
  });
});
