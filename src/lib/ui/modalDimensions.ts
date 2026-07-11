export const MODAL_OVERLAY_PADDING = 48;

const MODAL_VIEWPORT_PADDING = MODAL_OVERLAY_PADDING * 2;

export type ModalDesignSize = {
  width?: number;
  height?: number;
  decorativeHeight?: number;
};

export type ResolvedModalSize = {
  width?: number;
  height?: number;
  decorativeHeight?: number;
};

const DEFAULT_MODAL_WIDTH = 380;

export function resolveModalSize(
  design: ModalDesignSize,
  viewportWidth: number,
  viewportHeight: number,
): ResolvedModalSize {
  const maxWidth = viewportWidth - MODAL_VIEWPORT_PADDING;
  const maxHeight = viewportHeight - MODAL_VIEWPORT_PADDING;
  const designWidth = design.width ?? DEFAULT_MODAL_WIDTH;

  if (design.height == null) {
    return {
      width: Math.min(designWidth, maxWidth),
      height: undefined,
      decorativeHeight: design.decorativeHeight,
    };
  }

  const scale = Math.min(
    1,
    maxWidth / designWidth,
    maxHeight / design.height,
  );

  return {
    width: designWidth * scale,
    height: design.height * scale,
    decorativeHeight:
      design.decorativeHeight != null
        ? design.decorativeHeight * scale
        : undefined,
  };
}
