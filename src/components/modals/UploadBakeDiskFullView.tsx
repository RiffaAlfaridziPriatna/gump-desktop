import {formatGigabytes} from '@lib/export/formatByteSize';
import {View} from 'react-native';
import IconError from '../../assets/images/icon_error.svg';
import {
  PopupButton,
  PopupIcon,
  PopupTitleBlock,
  popupStyles,
} from './UploadPopupParts';

type UploadBakeDiskFullViewProps = {
  requiredBytes: number;
  onTryAgain: () => void;
  onCancel: () => void;
};

export function UploadBakeDiskFullView({
  requiredBytes,
  onTryAgain,
  onCancel,
}: UploadBakeDiskFullViewProps) {
  return (
    <View style={popupStyles.content}>
      <PopupIcon>
        <IconError width={40} height={40} />
      </PopupIcon>
      <PopupTitleBlock
        title="Not enough space on this computer"
        subtitle={`This upload needs ${formatGigabytes(
          requiredBytes,
        )} of free space to apply looks. Free up space and try again.`}
        urgent
      />
      <View style={popupStyles.buttonRow}>
        <PopupButton
          label="Try again"
          variant="primary"
          onPress={onTryAgain}
          autoFocus
        />
        <PopupButton label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}
