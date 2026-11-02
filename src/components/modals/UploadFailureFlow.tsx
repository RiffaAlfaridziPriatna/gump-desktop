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
}: UploadFailureFlowProps) {
  const {retryFailedServerUploads} = useCulledAlbumActions();
  // Keep the last resolved check during a refresh so the view (and focus) stays.
  const lastResolved = useRef<CloudStoragePreflight | null>(null);
  if (preflight.status !== 'checking') {
    lastResolved.current = preflight;
  }
  const check = lastResolved.current ?? preflight;
  const hasQuota = summary.quota > 0;
  const fits = check.status === 'ok' || check.status === 'nearLimit';

  if (hasQuota && (check.status === 'exceeded' || check.status === 'unavailable')) {
    return (
      <UploadCloudStorageView
        preflight={check}
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

  const includeQuota = hasQuota && fits;
  return (
    <UploadFailureView
      uploaded={summary.uploaded}
      total={summary.total}
      retryCount={summary.retryable + (includeQuota ? summary.quota : 0)}
      finalCount={summary.final}
      onRetry={() => retryFailedServerUploads(albumId, {includeQuota})}
      onBackToAlbum={onBackToAlbum}
    />
  );
}

type UploadBakeDiskFullProps = {
  albumId: string;
  requiredBytes: number;
  onCancel: () => void;
};

export function UploadBakeDiskFull({
  albumId,
  requiredBytes,
  onCancel,
}: UploadBakeDiskFullProps) {
  const {retryUploadLookBake} = useCulledAlbumActions();
  return (
    <UploadBakeDiskFullView
      requiredBytes={requiredBytes}
      onTryAgain={() => retryUploadLookBake(albumId)}
      onCancel={onCancel}
    />
  );
}
