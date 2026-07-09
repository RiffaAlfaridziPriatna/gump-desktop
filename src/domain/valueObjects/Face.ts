export class FaceBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;

  constructor(data: {left: number; top: number; width: number; height: number}) {
    this.left = data.left;
    this.top = data.top;
    this.width = data.width;
    this.height = data.height;
  }

  static fromPlain(data: {left: number; top: number; width: number; height: number}): FaceBounds {
    return new FaceBounds(data);
  }

  toPlain(): {left: number; top: number; width: number; height: number} {
    return {
      left: this.left,
      top: this.top,
      width: this.width,
      height: this.height,
    };
  }
}

export class FaceLandmark {
  readonly type: string;
  readonly x: number;
  readonly y: number;

  constructor(data: {type: string; x: number; y: number}) {
    this.type = data.type;
    this.x = data.x;
    this.y = data.y;
  }

  static fromPlain(data: {type: string; x: number; y: number}): FaceLandmark {
    return new FaceLandmark(data);
  }

  toPlain(): {type: string; x: number; y: number} {
    return {
      type: this.type,
      x: this.x,
      y: this.y,
    };
  }
}

export class FacePose {
  readonly pitch: number;
  readonly roll: number;
  readonly yaw: number;

  constructor(data: {pitch: number; roll: number; yaw: number}) {
    this.pitch = data.pitch;
    this.roll = data.roll;
    this.yaw = data.yaw;
  }

  static fromPlain(data: {pitch: number; roll: number; yaw: number}): FacePose {
    return new FacePose(data);
  }

  toPlain(): {pitch: number; roll: number; yaw: number} {
    return {
      pitch: this.pitch,
      roll: this.roll,
      yaw: this.yaw,
    };
  }
}

export type EyeStatus = 'open' | 'closed' | 'partial';
export type FocusLevel = 'good' | 'soft' | 'blurred';

export class Face {
  readonly bounds: FaceBounds;
  readonly faceId: string;
  readonly eyeStatus: EyeStatus;
  readonly eyeConfidence: number;
  readonly focusLevel: FocusLevel;
  readonly landmarks: FaceLandmark[];
  readonly pose: FacePose;
  readonly sharpness: number;
  readonly brightness: number;
  readonly clusterId: string | null;

  constructor(data: {
    bounds: FaceBounds;
    faceId: string;
    eyeStatus: EyeStatus;
    eyeConfidence: number;
    focusLevel: FocusLevel;
    landmarks: FaceLandmark[];
    pose: FacePose;
    sharpness: number;
    brightness: number;
    clusterId?: string | null;
  }) {
    this.bounds = data.bounds;
    this.faceId = data.faceId;
    this.eyeStatus = data.eyeStatus;
    this.eyeConfidence = data.eyeConfidence;
    this.focusLevel = data.focusLevel;
    this.landmarks = data.landmarks;
    this.pose = data.pose;
    this.sharpness = data.sharpness;
    this.brightness = data.brightness;
    this.clusterId = data.clusterId ?? null;
  }

  static fromPlain(data: any): Face {
    return new Face({
      faceId: String(data.faceId ?? data.rekognitionFaceId ?? ''),
      bounds: FaceBounds.fromPlain(data.boundingBox || data.bounds),
      eyeStatus: (data.eyeStatus ?? data.eyesOpen?.value ?? 'partial') as EyeStatus,
      eyeConfidence: Number(
        data.eyeConfidence ?? data.eyesOpen?.confidence ?? 0,
      ),
      focusLevel: (data.focusLevel ?? 'soft') as FocusLevel,
      landmarks: (data.landmarks || []).map(FaceLandmark.fromPlain),
      pose: FacePose.fromPlain(data.pose),
      sharpness: Number(data.sharpness ?? 0),
      brightness: Number(data.brightness ?? 0),
      clusterId: data.rekognitionFaceId ?? data.clusterId ?? null,
    });
  }

  toPlain(): any {
    return {
      boundingBox: this.bounds.toPlain(),
      eyeStatus: this.eyeStatus,
      eyeConfidence: this.eyeConfidence,
      focusLevel: this.focusLevel,
      rekognitionFaceId: this.clusterId ?? undefined,
      landmarks: this.landmarks.map(l => l.toPlain()),
      pose: this.pose.toPlain(),
      sharpness: this.sharpness,
      brightness: this.brightness,
    };
  }
}
