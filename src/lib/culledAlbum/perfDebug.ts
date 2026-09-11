import {getPhotosSnapshot, photoKey, photoStateStore} from './photoStateStore';

type PerfSample = {
  at: number;
  kind: string;
  albumId?: string;
  extra?: Record<string, number | string | boolean | undefined>;
};

const samples: PerfSample[] = [];
const MAX_SAMPLES = 500;

function perfEnabled(): boolean {
  return Boolean(__DEV__ && (globalThis as {__GUMP_PERF__?: boolean}).__GUMP_PERF__);
}

export function gumpPerfMark(
  kind: string,
  extra?: Record<string, number | string | boolean | undefined> & {
    albumId?: string;
  },
): void {
  if (!perfEnabled()) {
    return;
  }
  const {albumId, ...rest} = extra ?? {};
  samples.push({at: Date.now(), kind, albumId, extra: rest});
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function gumpPerfInspectAlbum(albumId: string): Record<string, unknown> {
  const {culledAlbumStore} =
    require('./store') as typeof import('./store');
  const {photoRenderStore} =
    require('./photoRenderStore') as typeof import('./photoRenderStore');
  const album = culledAlbumStore.getState().albums[albumId];
  const snapshot = getPhotosSnapshot(albumId);
  const order = photoStateStore.getState().photoOrder[albumId] ?? [];
  const first = snapshot[0];
  const report = {
    albumId,
    cullingCompleted: album?.cullingCompleted ?? null,
    albumPhotosLength: album?.photos.length ?? 0,
    photoOrderLength: order.length,
    snapshotLength: snapshot.length,
    uploadedInSnapshot: snapshot.filter(photo => photo.status === 'uploaded')
      .length,
    analyzedInSnapshot: snapshot.filter(
      photo => photo.analysisStatus === 'analyzed',
    ).length,
    totalPhotos: album?.totalPhotos ?? null,
    analysisBatch: album?.analysisBatchCounts ?? null,
    snapshotRevision: photoRenderStore.getState().snapshotRevision,
    identityStable: first
      ? first ===
        photoStateStore.getState().photoState[photoKey(albumId, first.photoId)]
      : null,
  };
  if (__DEV__) {
    console.log('[gump-perf] album', report);
  }
  return report;
}

export function gumpPerfDump(): PerfSample[] {
  if (!perfEnabled() && samples.length === 0) {
    console.log(
      '[gump-perf] enable with `globalThis.__GUMP_PERF__ = true` then retry ingest',
    );
    return [];
  }

  const byKind = new Map<string, number>();
  let maxGap = 0;
  for (let index = 1; index < samples.length; index++) {
    maxGap = Math.max(maxGap, samples[index]!.at - samples[index - 1]!.at);
  }
  for (const sample of samples) {
    byKind.set(sample.kind, (byKind.get(sample.kind) ?? 0) + 1);
  }
  console.log('[gump-perf] dump', {
    samples: samples.length,
    maxGapMs: maxGap,
    byKind: Object.fromEntries(byKind),
    last20: samples.slice(-20),
  });
  return samples.slice();
}

export function gumpPerfReset(): void {
  samples.length = 0;
}

if (__DEV__) {
  Object.assign(globalThis, {
    gumpPerfDump,
    gumpPerfReset,
    gumpPerfInspectAlbum,
  });
}
