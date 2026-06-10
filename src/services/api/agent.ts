import {Injectable} from '@lib/di';
import {API_BASE_URL} from '@lib/constants';
import {APIException} from './exception';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

@Injectable()
export class APIAgent {
  private token: string | null = null;
  baseUrl: string = API_BASE_URL;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async request<T = Record<string, any>>(
    method: Method,
    path: string,
    payload?: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);

    const options: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (payload) {
      if (method === 'GET') {
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        }
      } else {
        options.body = JSON.stringify(payload);
      }
    }

    const response = await fetch(url.toString(), options);
    const content = await response.json();

    if (response.status >= 400) {
      throw new APIException(
        response.status,
        content.error,
        content.message,
        content.details,
      );
    }

    return content;
  }

  async requestWithToken<T = Record<string, any>>(
    method: Method,
    path: string,
    payload?: Record<string, any>,
  ): Promise<T> {
    if (!this.token) throw new Error('No token provided');
    return this.request(method, path, payload, {
      Authorization: `Bearer ${this.token}`,
    });
  }
}
