type FlowProps = Record<string, string | number | boolean | null>;

const flowStarts = new Map<string, number>();
const flowProps = new Map<string, FlowProps>();

export function beginTimedFlow(key: string, properties?: FlowProps): void {
  flowStarts.set(key, Date.now());
  if (properties) {
    flowProps.set(key, {...properties});
  } else {
    flowProps.delete(key);
  }
}

export function endTimedFlow(key: string): {
  durationMs: number | null;
  properties: FlowProps;
} {
  const startedAt = flowStarts.get(key);
  flowStarts.delete(key);
  const properties = flowProps.get(key) ?? {};
  flowProps.delete(key);
  return {
    durationMs: startedAt == null ? null : Date.now() - startedAt,
    properties,
  };
}

export function localImportFlowKey(albumId: string): string {
  return `local_import:${albumId}`;
}

export function cullingFlowKey(albumId: string): string {
  return `culling:${albumId}`;
}

export function serverUploadFlowKey(albumId: string): string {
  return `server_upload:${albumId}`;
}
