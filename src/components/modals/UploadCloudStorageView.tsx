import {formatPhotoCount} from '@application/plan/formatPlanNumbers';
import {formatGigabytes} from '@lib/export/formatByteSize';
import type {CloudStoragePreflight} from '@lib/culledAlbum/uploadPreflight';
import {View} from 'react-native';
import IconError from '../../assets/images/icon_error.svg';
import {CloudStorageBanner} from './CloudStorageBanner';
import {CloudStorageCard} from './CloudStorageCard';
import {PopupButton, PopupIcon, PopupTitleBlock, popupStyles} from './UploadPopupParts';

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
        />
        <View style={popupStyles.buttonRow}>
          <PopupButton
            label="Try again"
            variant="primary"
            onPress={onRetry}
            autoFocus
          />
          <PopupButton label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    );
  }

  if (preflight.status === 'exceeded') {
    const remaining = Math.max(0, (preflight.limitBytes ?? 0) - preflight.usedBytes);
    return (
      <View style={popupStyles.content}>
        <PopupTitleBlock
          title="Not enough cloud storage"
          subtitle={`This upload needs ${formatGigabytes(
            preflight.uploadBytes,
          )}. You have ${formatGigabytes(remaining)} remaining.`}
        />
        <View style={popupStyles.fullWidth}>
          <CloudStorageCard {...preflight} exceeded />
          <CloudStorageBanner
            tone="danger"
            message="Upgrade your cloud plan, free up storage or select fewer photos."
          />
        </View>
        <View style={popupStyles.buttonColumn}>
          <PopupButton
            label="View cloud plans"
            variant="primary"
            onPress={onViewCloudPlans}
            autoFocus
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
    preflight.limitBytes == null ? 0 : preflight.limitBytes - preflight.afterBytes;
  return (
    <View style={popupStyles.content}>
      <PopupTitleBlock title={uploadTitle(photoCount)} />
      <View style={popupStyles.fullWidth}>
        <CloudStorageCard {...preflight} />
        {preflight.status === 'nearLimit' ? (
          <CloudStorageBanner
            tone="warning"
            message={`You'll have ${formatGigabytes(
              left,
            )} of cloud storage left after this upload.`}
          />
        ) : null}
      </View>
      <PopupButton
        label={starting ? 'Starting...' : 'Upload now'}
        variant="primary"
        onPress={onUploadNow}
        disabled={starting || photoCount === 0}
        autoFocus
        single
      />
    </View>
  );
}
