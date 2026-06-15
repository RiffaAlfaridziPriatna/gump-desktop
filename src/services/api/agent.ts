import {Injectable} from '@lib/di';
import {API_BASE_URL} from '@lib/constants';
import {APIException} from './exception';
import {APIResponse} from './types';

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

  private transformPayloadWithCursor(
    payload: Record<string, any> | undefined,
  ): Record<string, any> | undefined {
    if (
      payload &&
      typeof payload.cursor === 'string' &&
      payload.cursor.startsWith('http')
    ) {
      return {
        ...payload,
        cursor: new URL(payload.cursor).searchParams.get('cursor'),
      };
    }
    return payload;
  }

  private transformResponseWithCursor<T extends APIResponse.List>(res: T): T {
    let next = res.next;
    if (next) {
      try {
        next = new URL(next).searchParams.get('cursor') || null;
      } catch {
        // cursor is already a plain string, keep as-is
      }
    }

    let previous = res.previous;
    if (previous) {
      try {
        previous = new URL(previous).searchParams.get('cursor') || null;
      } catch {
        // cursor is already a plain string, keep as-is
      }
    }

    return {
      ...res,
      next,
      previous,
    };
  }

  async requestWithCursor<T extends APIResponse.List>(
    method: Method,
    path: string,
    payload?: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.transformResponseWithCursor<T>(
      await this.request(
        method,
        path,
        this.transformPayloadWithCursor(payload),
        headers,
      ),
    );
  }

  async requestWithTokenAndCursor<T extends APIResponse.List>(
    method: Method,
    path: string,
    payload?: Record<string, any>,
  ): Promise<T> {
    return this.transformResponseWithCursor<T>(
      await this.requestWithToken(
        method,
        path,
        this.transformPayloadWithCursor(payload),
      ),
    );
  }
}
