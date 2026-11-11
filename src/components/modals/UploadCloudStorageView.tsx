import { formatPhotoCount } from '@application/plan/formatPlanNumbers';
import { formatGigabytes } from '@lib/export/formatByteSize';
import type { CloudStoragePreflight } from '@lib/culledAlbum/uploadPreflight';
import { useRef } from 'react';
import { View } from 'react-native';
import IconError from '../../assets/images/icon_error.svg';
import { CloudStorageBanner } from './CloudStorageBanner';
import { CloudStorageCard } from './CloudStorageCard';
import {
  PopupButton,
  PopupIcon,
  PopupTitleBlock,
  popupStyles,
} from './UploadPopupParts';

export type UploadCloudStorageViewProps = {
  preflight: CloudStoragePreflight;
  photoCount: number;
  starting: boolean;
  onUploadNow: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onViewCloudPlans: () => void;
  onChooseFewer: () => void;
};

const EXCEEDED_BANNER =
  'Upgrade your cloud plan, free up storage or select fewer photos.';

function uploadTitle(photoCount: number): string {
  return `Upload ${formatPhotoCount(photoCount)} photo${
    photoCount === 1 ? '' : 's'
  } to Gump Cloud`;
}

export function UploadCloudStorageView({
  preflight,
  photoCount,
  starting,
  onUploadNow,
  onRetry,
  onCancel,
  onViewCloudPlans,
  onChooseFewer,
}: UploadCloudStorageViewProps) {
  // Keep the last resolved view during a refresh so focus is not dropped;
  // only the very first load shows the bare checking view.
  const lastResolved = useRef<CloudStoragePreflight | null>(null);
  const refreshing =
    preflight.status === 'checking' && lastResolved.current != null;
  if (preflight.status !== 'checking') {
    lastResolved.current = preflight;
  }
  const shown = refreshing ? lastResolved.current! : preflight;
  return renderState(shown, refreshing, {
    photoCount,
    starting,
    onUploadNow,
    onRetry,
    onCancel,
    onViewCloudPlans,
    onChooseFewer,
  });
}

type Actions = Omit<UploadCloudStorageViewProps, 'preflight'>;

function renderState(
  preflight: CloudStoragePreflight,
  refreshing: boolean,
  {
    photoCount,
    starting,
    onUploadNow,
    onRetry,
    onCancel,
    onViewCloudPlans,
    onChooseFewer,
  }: Actions,
) {
  if (preflight.status === 'checking') {
    return (
      <View style={popupStyles.content}>
        <PopupTitleBlock
          title={uploadTitle(photoCount)}
          subtitle="Checking cloud storage…"
        />
      </View>
    );
  }

  if (preflight.status === 'unavailable') {
    return (
      <View style={popupStyles.content}>
        <PopupIcon>
          <IconError width={40} height={40} />
        </PopupIcon>
        <PopupTitleBlock
          title="Couldn't check cloud storage"
          subtitle="Check your connection and try again."
          urgent
        />
        <View style={popupStyles.buttonRow}>
          <PopupButton
            label="Try again"
            variant="primary"
            onPress={onRetry}
            disabled={refreshing}
            autoFocus
          />
          <PopupButton label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    );
  }

  if (preflight.status === 'exceeded') {
    const remaining = Math.max(
      0,
      (preflight.limitBytes ?? 0) - preflight.usedBytes,
    );
    return (
      <View style={popupStyles.content}>
        <PopupTitleBlock
          title="Not enough cloud storage"
          subtitle={`This upload needs ${formatGigabytes(
            preflight.uploadBytes,
          )}. You have ${formatGigabytes(remaining)} remaining.`}
          extra={EXCEEDED_BANNER}
          urgent
        />
        <View style={popupStyles.fullWidth}>
          <CloudStorageCard {...preflight} exceeded />
          <CloudStorageBanner tone="danger" message={EXCEEDED_BANNER} />
        </View>
        <View style={popupStyles.buttonColumn}>
          <PopupButton
            label="View cloud plans"
            variant="primary"
            onPress={onViewCloudPlans}
            autoFocus
            single
          />
          <PopupButton
            label="Choose fewer photos"
            variant="text"
            onPress={onChooseFewer}
          />
        </View>
      </View>
    );
  }

  const left =
    preflight.limitBytes == null
      ? 0
      : preflight.limitBytes - preflight.afterBytes;
  const nearLimitMessage =
    preflight.status === 'nearLimit'
      ? `You'll have ${formatGigabytes(
          left,
        )} of cloud storage left after this upload.`
      : undefined;
  return (
    <View style={popupStyles.content}>
      <PopupTitleBlock
        title={uploadTitle(photoCount)}
        extra={nearLimitMessage}
      />
      <View style={popupStyles.fullWidth}>
        <CloudStorageCard {...preflight} />
        {preflight.status === 'nearLimit' ? (
          <CloudStorageBanner tone="warning" message={nearLimitMessage!} />
        ) : null}
      </View>
      <PopupButton
        label={starting ? 'Starting...' : 'Upload now'}
        variant="primary"
        onPress={onUploadNow}
        disabled={starting || photoCount === 0 || refreshing}
        accessibilityHint={
          photoCount === 0 ? 'Select photos to upload' : undefined
        }
        autoFocus
        single
      />
    </View>
  );
}
