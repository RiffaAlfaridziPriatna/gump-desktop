export class FileAsset {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly capturedAt: number | null;
  readonly thumbnailUri: string | null;
  readonly previewUri: string | null;

  constructor(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    previewUri?: string | null;
  }) {
    this.uri = data.uri;
    this.name = data.name;
    this.size = data.size;
    this.type = data.type;
    this.capturedAt = data.capturedAt ?? null;
    this.thumbnailUri = data.thumbnailUri ?? null;
    this.previewUri = data.previewUri ?? null;
  }

  static fromPlain(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    previewUri?: string | null;
  }): FileAsset {
    return new FileAsset(data);
  }

  toPlain(): {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt: number | null;
    thumbnailUri: string | null;
    previewUri: string | null;
  } {
    return {
      uri: this.uri,
      name: this.name,
      size: this.size,
      type: this.type,
      capturedAt: this.capturedAt,
      thumbnailUri: this.thumbnailUri,
      previewUri: this.previewUri,
    };
  }
}
