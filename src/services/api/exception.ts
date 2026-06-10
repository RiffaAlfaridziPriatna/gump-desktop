export type APIValidationError<Type> = Readonly<
  Type extends Record<any, any> | undefined
    ? {[field in keyof Type]?: APIValidationError<Type[field]>} & {
        _errors: string[];
      }
    : {_errors: string[]} | undefined
>;

export class APIException<RequestBody = undefined> extends Error {
  constructor(
    readonly statusCode: number,
    readonly name: string,
    message: string,
    readonly details: RequestBody extends Record<string, any>
      ? APIValidationError<RequestBody>
      : undefined,
  ) {
    super(message);
  }
}

export function assertAPIException<T = undefined>(
  err: any,
): asserts err is APIException<T> {
  if (!(err instanceof APIException)) throw err;
}

export function flattenValidationErrors(details: unknown): string[] {
  if (!details || typeof details !== 'object') return [];
  const messages: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: Record<string, unknown>) => {
    if (seen.has(node)) return;
    seen.add(node);
    const errors = node._errors;
    if (Array.isArray(errors)) {
      for (const msg of errors) {
        if (typeof msg === 'string' && msg.length > 0) messages.push(msg);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === '_errors') continue;
      const child = node[key];
      if (child && typeof child === 'object')
        walk(child as Record<string, unknown>);
    }
  };

  walk(details as Record<string, unknown>);
  return messages;
}
