import {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {useCallback, useRef, useState} from 'react';
import {View} from 'react-native';

export function useKeyFaceTooltip() {
  const [keyFaceTooltip, setKeyFaceTooltip] =
    useState<KeyFaceTooltipAnchor | null>(null);
  const [keyFaceTooltipWidth, setKeyFaceTooltipWidth] = useState(0);
  const [screenOrigin, setScreenOrigin] = useState({x: 0, y: 0});
  const screenRootRef = useRef<View>(null);

  const syncScreenOrigin = useCallback(() => {
    screenRootRef.current?.measureInWindow((x, y) => {
      setScreenOrigin({x, y});
    });
  }, []);

  const handleKeyFaceTooltipChange = useCallback(
    (anchor: KeyFaceTooltipAnchor | null) => {
      if (!anchor) {
        setKeyFaceTooltip(null);
        setKeyFaceTooltipWidth(0);
        return;
      }

      screenRootRef.current?.measureInWindow((x, y) => {
        setScreenOrigin({x, y});
        setKeyFaceTooltipWidth(0);
        setKeyFaceTooltip(anchor);
      });
    },
    [],
  );

  const dismissKeyFaceTooltip = useCallback(() => {
    handleKeyFaceTooltipChange(null);
  }, [handleKeyFaceTooltipChange]);

  return {
    screenRootRef,
    keyFaceTooltip,
    keyFaceTooltipWidth,
    screenOrigin,
    syncScreenOrigin,
    handleKeyFaceTooltipChange,
    dismissKeyFaceTooltip,
    setKeyFaceTooltipWidth,
  };
}
