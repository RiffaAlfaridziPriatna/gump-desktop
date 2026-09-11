import {findNodeHandle, NativeModules, Platform} from 'react-native';

export type NativeScrollReason =
  | 'ok'
  | 'not_macos'
  | 'native_module_missing'
  | 'native_tag_null'
  | 'native_view_not_found'
  | 'scroll_view_not_found'
  | 'native_call_threw';

export type NativeScrollResult = {
  resolved: boolean;
  reason: NativeScrollReason;
  viewClass: string | null;
  beforeVisibleY: number | null;
  afterVisibleY: number | null;
  beforeClipY: number | null;
  afterClipY: number | null;
  documentHeight: number | null;
  clipHeight: number | null;
  documentFlipped: boolean | null;
  clipFlipped: boolean | null;
  moved: boolean;
  atTarget: boolean;
  elapsedMs: number;
};

type NativeScrollPayload = Partial<Omit<NativeScrollResult, 'elapsedMs'>>;

type NativeScrollModule = {
  scrollToOffset: (
    reactTag: number,
    offsetY: number,
  ) => Promise<NativeScrollPayload>;
};

function emptyResult(
  reason: NativeScrollReason,
  elapsedMs: number,
): NativeScrollResult {
  return {
    resolved: false,
    reason,
    viewClass: null,
    beforeVisibleY: null,
    afterVisibleY: null,
    beforeClipY: null,
    afterClipY: null,
    documentHeight: null,
    clipHeight: null,
    documentFlipped: null,
    clipFlipped: null,
    moved: false,
    atTarget: false,
    elapsedMs,
  };
}

function getNativeScrollModule(): NativeScrollModule | null {
  if (Platform.OS !== 'macos') {
    return null;
  }
  const native = NativeModules.GumpScrollView as NativeScrollModule | undefined;
  return native?.scrollToOffset ? native : null;
}

// Preferred order: getNativeScrollRef -> getScrollResponder -> findNodeHandle.
// Do not assume findNodeHandle(FlatList) is the host RCTScrollView.
function getNativeTag(component: unknown): number | null {
  const withScrollRefs = component as {
    getNativeScrollRef?: () => unknown;
    getScrollResponder?: () => unknown;
  };
  const scrollRef =
    withScrollRefs?.getNativeScrollRef?.() ??
    withScrollRefs?.getScrollResponder?.() ??
    component;
  const tag = findNodeHandle(scrollRef as Parameters<typeof findNodeHandle>[0]);
  return typeof tag === 'number' ? tag : null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function nativeScrollToOffset(
  component: unknown,
  offsetY: number,
): Promise<NativeScrollResult> {
  const startedAt = Date.now();
  if (Platform.OS !== 'macos') {
    return emptyResult('not_macos', 0);
  }
  const native = getNativeScrollModule();
  if (!native) {
    return emptyResult('native_module_missing', Date.now() - startedAt);
  }
  const tag = getNativeTag(component);
  if (tag == null) {
    return emptyResult('native_tag_null', Date.now() - startedAt);
  }
  try {
    const raw = await native.scrollToOffset(tag, offsetY);
    const elapsedMs = Date.now() - startedAt;
    if (!raw?.resolved) {
      return {
        ...emptyResult(
          (raw?.reason as NativeScrollReason) ?? 'native_view_not_found',
          elapsedMs,
        ),
        viewClass: typeof raw?.viewClass === 'string' ? raw.viewClass : null,
      };
    }
    return {
      resolved: true,
      reason: 'ok',
      viewClass: typeof raw.viewClass === 'string' ? raw.viewClass : null,
      beforeVisibleY: toNumber(raw.beforeVisibleY),
      afterVisibleY: toNumber(raw.afterVisibleY),
      beforeClipY: toNumber(raw.beforeClipY),
      afterClipY: toNumber(raw.afterClipY),
      documentHeight: toNumber(raw.documentHeight),
      clipHeight: toNumber(raw.clipHeight),
      documentFlipped:
        typeof raw.documentFlipped === 'boolean' ? raw.documentFlipped : null,
      clipFlipped: typeof raw.clipFlipped === 'boolean' ? raw.clipFlipped : null,
      moved: raw.moved === true,
      atTarget: raw.atTarget === true,
      elapsedMs,
    };
  } catch {
    return emptyResult('native_call_threw', Date.now() - startedAt);
  }
}
