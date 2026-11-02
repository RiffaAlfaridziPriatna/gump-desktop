import {useCulledAlbumActions} from '@context/culledAlbumHooks';
import type {UploadFailureSummary} from '@hooks/useUploadFailureSummary';
import type {CloudStoragePreflight} from '@lib/culledAlbum/uploadPreflight';
import {useRef} from 'react';
import {UploadBakeDiskFullView} from './UploadBakeDiskFullView';
import {UploadCloudStorageView} from './UploadCloudStorageView';
import {UploadFailureView} from './UploadFailureView';

const noop = () => undefined;

type UploadFailureFlowProps = {
  albumId: string;
  summary: UploadFailureSummary;
  preflight: CloudStoragePreflight;
  onRetryPreflight: () => void;
  onBackToAlbum: () => void;
  onClose: () => void;
  onViewCloudPlans: () => void;
  /** Called in the same event as a retry so the modal leaves the failure view in one commit. */
  onRetryStarted: () => void;
};

/** Upload finished with failures: partial failure, or the quota views until a fresh check fits. */
export function UploadFailureFlow({
  albumId,
  summary,
  preflight,
  onRetryPreflight,
  onBackToAlbum,
  onClose,
  onViewCloudPlans,
  onRetryStarted,
}: UploadFailureFlowProps) {
  const {retryFailedServerUploads} = useCulledAlbumActions();
  // Keep the last resolved check during a refresh so the view (and focus) stays.
  const lastResolved = useRef<CloudStoragePreflight | null>(null);
  if (preflight.status !== 'checking') {
    lastResolved.current = preflight;
  }
  const hasQuota = summary.quota > 0;
  const check = lastResolved.current;

  // With quota photos, choose failure vs quota view only after the first result.
  if (
    hasQuota &&
    (check == null ||
      check.status === 'exceeded' ||
      check.status === 'unavailable')
  ) {
    return (
      <UploadCloudStorageView
        preflight={preflight}
        photoCount={summary.total}
        starting={false}
        onUploadNow={noop}
        onRetry={onRetryPreflight}
        onCancel={onClose}
        onViewCloudPlans={onViewCloudPlans}
        onChooseFewer={onClose}
      />
    );
  }

  const includeQuota =
    hasQuota && (check?.status === 'ok' || check?.status === 'nearLimit');
  return (
    <UploadFailureView
      uploaded={summary.uploaded}
      total={summary.total}
      retryCount={summary.retryable + (includeQuota ? summary.quota : 0)}
      finalCount={summary.final}
      onRetry={() => {
        retryFailedServerUploads(albumId, {includeQuota});
        onRetryStarted();
      }}
      onBackToAlbum={onBackToAlbum}
    />
  );
}

type UploadBakeDiskFullProps = {
  albumId: string;
  requiredBytes: number;
  onCancel: () => void;
  onRetryStarted: () => void;
};

export function UploadBakeDiskFull({
  albumId,
  requiredBytes,
  onCancel,
  onRetryStarted,
}: UploadBakeDiskFullProps) {
  const {retryUploadLookBake} = useCulledAlbumActions();
  return (
    <UploadBakeDiskFullView
      requiredBytes={requiredBytes}
      onTryAgain={() => {
        retryUploadLookBake(albumId);
        onRetryStarted();
      }}
      onCancel={onCancel}
    />
  );
}
