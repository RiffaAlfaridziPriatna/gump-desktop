export class FileAsset {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly capturedAt: number | null;
  readonly thumbnailUri: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly detailUri: string | null;
  readonly lookDetailUri: string | null;
  readonly lookDetailKey: string | null;

  constructor(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    detailUri?: string | null;
    lookDetailUri?: string | null;
    lookDetailKey?: string | null;
  }) {
    this.uri = data.uri;
    this.name = data.name;
    this.size = data.size;
    this.type = data.type;
    this.capturedAt = data.capturedAt ?? null;
    this.thumbnailUri = data.thumbnailUri ?? null;
    this.thumbnailWidth = data.thumbnailWidth ?? null;
    this.thumbnailHeight = data.thumbnailHeight ?? null;
    this.detailUri = data.detailUri ?? null;
    this.lookDetailUri = data.lookDetailUri ?? null;
    this.lookDetailKey = data.lookDetailKey ?? null;
  }

  static fromPlain(data: {
    uri: string;
    name: string;
    size: number;
    type: string;
    capturedAt?: number | null;
    thumbnailUri?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    detailUri?: string | null;
    lookDetailUri?: string | null;
    lookDetailKey?: string | null;
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
    thumbnailWidth: number | null;
    thumbnailHeight: number | null;
    detailUri: string | null;
    lookDetailUri: string | null;
    lookDetailKey: string | null;
  } {
    return {
      uri: this.uri,
      name: this.name,
      size: this.size,
      type: this.type,
      capturedAt: this.capturedAt,
      thumbnailUri: this.thumbnailUri,
      thumbnailWidth: this.thumbnailWidth,
      thumbnailHeight: this.thumbnailHeight,
      detailUri: this.detailUri,
      lookDetailUri: this.lookDetailUri,
      lookDetailKey: this.lookDetailKey,
    };
  }
}
