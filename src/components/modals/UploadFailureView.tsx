import {formatPhotoCount} from '@application/plan/formatPlanNumbers';
import {View} from 'react-native';
import IconError from '../../assets/images/icon_error.svg';
import {
  PopupButton,
  PopupIcon,
  PopupTitleBlock,
  popupStyles,
} from './UploadPopupParts';

export type UploadFailureViewProps = {
  uploaded: number;
  total: number;
  /** Photos "Retry" re-queues (quota photos included only after a fresh check fits). */
  retryCount: number;
  /** Photos that can never be uploaded. */
  finalCount: number;
  onRetry: () => void;
  onBackToAlbum: () => void;
};

function photos(count: number): string {
  return `${formatPhotoCount(count)} photo${count === 1 ? '' : 's'}`;
}

export function UploadFailureView({
  uploaded,
  total,
  retryCount,
  finalCount,
  onRetry,
  onBackToAlbum,
}: UploadFailureViewProps) {
  const lines: string[] = [];
  if (retryCount > 0) {
    lines.push(
      `${photos(retryCount)} failed. Retry uploads only ${
        retryCount === 1 ? 'this photo' : `these ${formatPhotoCount(retryCount)}`
      }.`,
    );
  }
  if (finalCount > 0) {
    lines.push(`${photos(finalCount)} can't be uploaded.`);
  }

  return (
    <View style={popupStyles.content}>
      <PopupIcon>
        <IconError width={40} height={40} />
      </PopupIcon>
      <PopupTitleBlock
        title={`${formatPhotoCount(uploaded)} of ${photos(total)} uploaded`}
        subtitle={lines.join('\n')}
        urgent
      />
      <View style={popupStyles.buttonRow}>
        {retryCount > 0 ? (
          <PopupButton
            label={`Retry ${photos(retryCount)}`}
            variant="primary"
            onPress={onRetry}
            autoFocus
          />
        ) : null}
        <PopupButton
          label="Back to album"
          variant={retryCount > 0 ? 'secondary' : 'primary'}
          onPress={onBackToAlbum}
          autoFocus={retryCount === 0}
          single={retryCount === 0}
        />
      </View>
    </View>
  );
}
