export class FileAsset {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly capturedAt: number | null;
  readonly thumbnailUri: string | null;
  readonly detailUri: string | null;

  constructor(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    detailUri?: string | null;
  }) {
    this.uri = data.uri;
    this.name = data.name;
    this.size = data.size;
    this.type = data.type;
    this.capturedAt = data.capturedAt ?? null;
    this.thumbnailUri = data.thumbnailUri ?? null;
    this.detailUri = data.detailUri ?? null;
  }

  static fromPlain(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    detailUri?: string | null;
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
    detailUri: string | null;
  } {
    return {
      uri: this.uri,
      name: this.name,
      size: this.size,
      type: this.type,
      capturedAt: this.capturedAt,
      thumbnailUri: this.thumbnailUri,
      detailUri: this.detailUri,
    };
  }
}
