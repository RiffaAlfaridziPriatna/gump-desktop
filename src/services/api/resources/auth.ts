import {Injectable} from '@lib/di';
import {APIAgent} from '../agent';
import {APIRequest, APIResponse} from '../types';
import {assertAPIException} from '../exception';

@Injectable()
export class AuthResource {
  constructor(private readonly agent: APIAgent) {}

  async getCurrentUser(): Promise<APIResponse.User | APIResponse.Guest | null> {
    try {
      return await this.agent.requestWithToken('GET', 'me');
    } catch (err) {
      assertAPIException(err);
      return null;
    }
  }

  login(credentials: APIRequest.Login): Promise<APIResponse.UserToken> {
    return this.agent.request('POST', 'login', {
      app: 'web',
      ...credentials,
    });
  }

  async forgotPassword(email: string): Promise<boolean> {
    const response = await this.agent.request<{success: boolean}>(
      'POST',
      'forgot-password',
      {email},
    );
    return response.success;
  }
}
