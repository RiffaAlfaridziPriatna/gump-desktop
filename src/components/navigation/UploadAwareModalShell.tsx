import {
  ModalSlideEnter,
  type ModalSlideEnterHandle,
} from '@components/navigation/ModalSlideEnter';
import {PropsWithChildren, RefObject} from 'react';

export type UploadAwareModalShellProps = {
  slideRef: RefObject<ModalSlideEnterHandle | null>;
  enabled: boolean;
  instant?: boolean;
  onEnterComplete: () => void;
};

export function UploadAwareModalShell({
  slideRef,
  enabled,
  instant,
  onEnterComplete,
  children,
}: PropsWithChildren<UploadAwareModalShellProps>) {
  return (
    <ModalSlideEnter
      ref={slideRef}
      enabled={enabled}
      instant={instant}
      onEnterComplete={onEnterComplete}>
      {children}
    </ModalSlideEnter>
  );
}
