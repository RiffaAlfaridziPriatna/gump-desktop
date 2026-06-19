import {APIResponse} from '@services/api';
import {ComponentType} from 'react';
import {SvgProps} from 'react-native-svg';

import IconEyesClosed from '../../assets/images/icon_eyes_closed.svg';
import IconEyesOpened from '../../assets/images/icon_eyes_opened.svg';
import IconEyesPartial from '../../assets/images/icon_eyes_partial.svg';
import IconFocusBlurred from '../../assets/images/icon_focus_blurred.svg';
import IconFocusGood from '../../assets/images/icon_focus_good.svg';
import IconFocusSoft from '../../assets/images/icon_focus_soft.svg';

export const cullingStatusColors = {
  good: '#41B437',
  warning: '#FFD700',
  bad: '#FF6E5A',
} as const;

export type CullingStatusColor =
  (typeof cullingStatusColors)[keyof typeof cullingStatusColors];

type StatusIcon = ComponentType<SvgProps>;

export type FaceStatusMeta = {
  Icon: StatusIcon;
  label: string;
  color: CullingStatusColor;
};

export function getEyeStatusMeta(
  eyeStatus: APIResponse.CullingEyeStatus,
): FaceStatusMeta {
  switch (eyeStatus) {
    case 'closed':
      return {
        Icon: IconEyesClosed,
        label: 'Closed Eyes',
        color: cullingStatusColors.bad,
      };
    case 'partial':
      return {
        Icon: IconEyesPartial,
        label: 'Partial Eyes',
        color: cullingStatusColors.warning,
      };
    default:
      return {
        Icon: IconEyesOpened,
        label: 'Open Eyes',
        color: cullingStatusColors.good,
      };
  }
}

export function getFocusStatusMeta(
  focusLevel: APIResponse.CullingFocusLevel,
): FaceStatusMeta {
  switch (focusLevel) {
    case 'blurred':
      return {
        Icon: IconFocusBlurred,
        label: 'Blurred',
        color: cullingStatusColors.bad,
      };
    case 'soft':
      return {
        Icon: IconFocusSoft,
        label: 'Soft Focus',
        color: cullingStatusColors.warning,
      };
    default:
      return {
        Icon: IconFocusGood,
        label: 'Good Focus',
        color: cullingStatusColors.good,
      };
  }
}
