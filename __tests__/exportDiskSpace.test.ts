import {
  DISK_SPACE_MARGIN_BYTES,
  estimateExportBytes,
  hasEnoughDiskSpace,
} from '../src/lib/export/diskSpace';
import {formatGigabytes} from '../src/lib/export/formatByteSize';
import {
  UPLOAD_FAILURE_GROUP,
  type UploadFailureCause,
  type UploadFailureGroup,
} from '../src/lib/culledAlbum/uploadPreflight';

const GB = 1024 ** 3;

describe('hasEnoughDiskSpace', () => {
  it('passes at the exact margin edge and fails one byte below', () => {
    const required = 1000;
    expect(
      hasEnoughDiskSpace(required + DISK_SPACE_MARGIN_BYTES, required),
    ).toBe(true);
    expect(
      hasEnoughDiskSpace(required + DISK_SPACE_MARGIN_BYTES - 1, required),
    ).toBe(false);
  });
});

describe('hasEnoughDiskSpace invalid input', () => {
  it.each([
    [Number.NaN, 1],
    [Infinity, 1],
    [-1, 1],
    [1e12, -1],
    [1e12, Number.NaN],
  ])('rejects (%s, %s)', (available, required) => {
    expect(hasEnoughDiskSpace(available, required)).toBe(false);
  });
});

describe('estimateExportBytes', () => {
  it('returns zero for no photos', () => {
    expect(estimateExportBytes([])).toEqual({
      totalBytes: 0,
      missingSizeCount: 0,
    });
  });

  it('counts photos without size as 0 and reports them', () => {
    const photos = [
      {file: {size: 100}},
      {file: {size: 0}},
      {file: {size: Number.NaN}},
      {file: {size: 50}},
    ];
    expect(estimateExportBytes(photos)).toEqual({
      totalBytes: 150,
      missingSizeCount: 2,
    });
  });
});

describe('formatGigabytes', () => {
  it.each([
    [0, '0.0 GB'],
    [0.04 * GB, '<0.1 GB'],
    [0.8 * GB, '0.8 GB'],
    [120.4 * GB, '120.4 GB'],
  ])('formats %s bytes as %s', (bytes, expected) => {
    expect(formatGigabytes(bytes)).toBe(expected);
  });
});

describe('UPLOAD_FAILURE_GROUP', () => {
  it('maps every cause to a group (typecheck fails on a missing cause)', () => {
    const causes: Record<UploadFailureCause, true> = {
      network: true,
      timeout: true,
      server: true,
      rateLimited: true,
      storageLimit: true,
      dataUsageLimit: true,
      rejected: true,
      sourceMissing: true,
      unknown: true,
    };
    const groups = new Set<UploadFailureGroup>(['retryable', 'quota', 'final']);
    for (const cause of Object.keys(causes) as UploadFailureCause[]) {
      expect(groups.has(UPLOAD_FAILURE_GROUP[cause])).toBe(true);
    }
    expect(UPLOAD_FAILURE_GROUP.unknown).toBe('retryable');
  });
});
