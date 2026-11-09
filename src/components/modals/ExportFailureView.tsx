import {formatGigabytes} from '@lib/export/formatByteSize';
import type {ExportFailureReason} from '@lib/export/types';
import {StyleSheet, View} from 'react-native';
import IconError from '../../assets/images/icon_error.svg';
import {
  PopupButton,
  PopupIcon,
  PopupTitleBlock,
  popupStyles,
} from './UploadPopupParts';

export type ExportFailureViewProps = {
  reason: ExportFailureReason;
  /** Which step failed; steers the generic copy and the secondary action. */
  failedStep: 'prepare' | 'download';
  requiredBytes?: number;
  missingCount?: number;
  onTryAgain: () => void;
  onChangeSaveLocation: () => void;
  onCancel: () => void;
};

type FailureCopy = {title: string; subtitle: string};

function describeFailure({
  reason,
  failedStep,
  requiredBytes,
  missingCount,
}: ExportFailureViewProps): FailureCopy {
  switch (reason) {
    case 'diskFull':
      return {
        title: 'Not enough space on this computer',
        subtitle:
          requiredBytes != null
            ? `This export needs ${formatGigabytes(requiredBytes)}. Free up space or choose another location.`
            : 'Free up space or choose another location.',
      };
    case 'folderNotWritable':
      return {
        title: "Can't save to this folder",
        subtitle: "Choose another location or check the folder's permissions.",
      };
    case 'sourceMissing':
      return missingCount === 1
        ? {
            title: '1 source file is missing',
            subtitle: 'It was moved or deleted. Reconnect it and try again.',
          }
        : {
            title:
              missingCount != null
                ? `${missingCount} source files are missing`
                : 'Source files are missing',
            subtitle: 'They were moved or deleted. Reconnect them and try again.',
          };
    default:
      return failedStep === 'prepare'
        ? {
            title: 'Export failed',
            subtitle: 'Something went wrong while preparing your ZIP.',
          }
        : {
            title: 'Download failed',
            subtitle: 'Your export is still ready — nothing was lost.',
          };
  }
}

export function ExportFailureView(props: ExportFailureViewProps) {
  const {reason, failedStep, onTryAgain, onChangeSaveLocation, onCancel} =
    props;
  const {title, subtitle} = describeFailure(props);
  // Saving can be redirected only after the ZIP exists. Before that, disk and
  // folder failures offer Cancel; sourceMissing always does.
  const showChangeLocation =
    reason !== 'sourceMissing' && failedStep === 'download';
  const showCancel =
    reason === 'sourceMissing' ||
    (failedStep === 'prepare' &&
      (reason === 'diskFull' || reason === 'folderNotWritable'));
  const isSingleAction = !showChangeLocation && !showCancel;

  return (
    <View style={[popupStyles.content, styles.centered]}>
      <PopupIcon>
        <IconError width={40} height={40} />
      </PopupIcon>
      <PopupTitleBlock title={title} subtitle={subtitle} urgent />
      <View style={popupStyles.buttonRow}>
        <PopupButton
          label="Try again"
          variant="primary"
          onPress={onTryAgain}
          autoFocus
          single={isSingleAction}
        />
        {showChangeLocation ? (
          <PopupButton
            label="Change save location"
            variant="secondary"
            onPress={onChangeSaveLocation}
          />
        ) : null}
        {showCancel ? (
          <PopupButton label="Cancel" variant="secondary" onPress={onCancel} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
});
