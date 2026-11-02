import {formatPhotoCount} from '@application/plan/formatPlanNumbers';
import type {CloudStoragePreflight} from '@lib/culledAlbum/uploadPreflight';
import {View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle_40.svg';
import {UsedStorageCard} from './CloudStorageCard';
import {PopupButton, PopupIcon, PopupTitleBlock, popupStyles} from './UploadPopupParts';

type UploadCompleteViewProps = {
  photoCount: number;
  /** Fresh storage numbers; the card is omitted until a refetch has them. */
  preflight: CloudStoragePreflight;
  onBackToAlbum: () => void;
};

export function UploadCompleteView({
  photoCount,
  preflight,
  onBackToAlbum,
}: UploadCompleteViewProps) {
  const hasNumbers = preflight.status !== 'checking' && preflight.status !== 'unavailable';

  return (
    <View style={popupStyles.content}>
      <PopupIcon>
        <IconCheckCircle width={40} height={40} />
      </PopupIcon>
      <PopupTitleBlock
        title="Upload complete"
        subtitle={`${formatPhotoCount(photoCount)} photo${
          photoCount === 1 ? '' : 's'
        } uploaded`}
      />
      {hasNumbers ? (
        <UsedStorageCard
          usedBytes={preflight.usedBytes}
          limitBytes={preflight.limitBytes}
        />
      ) : null}
      <PopupButton
        label="Back to album"
        variant="primary"
        onPress={onBackToAlbum}
        autoFocus
        single
      />
    </View>
  );
}
