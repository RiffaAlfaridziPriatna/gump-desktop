import {KeyFaceSidebarItem} from '@components/culling/KeyFaceSidebarItem';
import {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {Accordion} from '@components/ui/Accordion';
import {Checkbox, Pressable} from '@components/ui';
import {KeyFaceWithSource} from '@lib/culling/cullingFaceCrop';
import {SelectionFilter} from '@lib/culling/culledAlbumPhotoFilters';
import {CullFilterKey} from '@lib/culling/cullingUtil';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {
  ScrollAwareTooltipContext,
  createScrollAwareTooltipStore,
  useScrollAwareTooltipHandlers,
} from '@lib/ui/scrollAwareTooltip';
import {memo, useCallback, useMemo, useRef} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircleOutline from '../../assets/images/icon_check_circle_outlined.svg';

const FILTER_LABELS: Record<CullFilterKey, string> = {
  aiSelected: 'AI Selected',
  maybe: 'Maybe',
  blurred: 'Blurred',
  closedEyes: 'Closed Eyes',
  duplicated: 'Duplicated',
};

const KEY_FACE_SIZE = 64;
const KEY_FACE_GAP = 16;
const KEY_FACE_COLUMNS = 3;
const KEY_FACE_ROW_HEIGHT = KEY_FACE_SIZE + KEY_FACE_GAP;

export type {KeyFaceWithSource};

export type CulledAlbumDetailSidebarProps = {
  isMobileLayout: boolean;
  totalPhotos: number;
  selectedCount: number;
  selectionFilter: SelectionFilter;
  onSelectionFilterChange: (filter: SelectionFilter) => void;
  activeFilters: Record<CullFilterKey, boolean>;
  onToggleFilter: (key: CullFilterKey) => void;
  filterCounts: Record<CullFilterKey, number>;
  cullFiltersExpanded: boolean;
  onCullFiltersToggle: () => void;
  keyFaces: KeyFaceWithSource[];
  keyFacesExpanded: boolean;
  onKeyFacesToggle: () => void;
  onKeyFaceTooltipChange: (anchor: KeyFaceTooltipAnchor | null) => void;
};

type KeyFaceRow = {
  key: string;
  rowIndex: number;
  faces: KeyFaceWithSource[];
};

function buildKeyFaceRows(faces: KeyFaceWithSource[]): KeyFaceRow[] {
  const rows: KeyFaceRow[] = [];

  for (let index = 0; index < faces.length; index += KEY_FACE_COLUMNS) {
    const rowIndex = index / KEY_FACE_COLUMNS;
    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      faces: faces.slice(index, index + KEY_FACE_COLUMNS),
    });
  }

  return rows;
}

type KeyFaceGridRowProps = {
  row: KeyFaceRow;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

const KeyFaceGridRow = memo(
  function KeyFaceGridRow({row, onTooltipAnchorChange}: KeyFaceGridRowProps) {
    return (
      <View style={styles.keyFaceRow}>
        {row.faces.map(face => (
          <KeyFaceSidebarItem
            key={face.faceId}
            cropUri={face.cropUri}
            eyeStatus={face.eyeStatus}
            focusLevel={face.focusLevel}
            width={KEY_FACE_SIZE}
            onTooltipAnchorChange={onTooltipAnchorChange}
          />
        ))}
        {row.faces.length < KEY_FACE_COLUMNS &&
          Array.from({length: KEY_FACE_COLUMNS - row.faces.length}).map(
            (_, fillerIndex) => (
              <View
                key={`filler-${row.rowIndex}-${fillerIndex}`}
                style={styles.keyFaceFiller}
              />
            ),
          )}
      </View>
    );
  },
  (prev, next) => prev.row === next.row,
);

function CulledAlbumDetailSidebarComponent({
  isMobileLayout,
  totalPhotos,
  selectedCount,
  selectionFilter,
  onSelectionFilterChange,
  activeFilters,
  onToggleFilter,
  filterCounts,
  cullFiltersExpanded,
  onCullFiltersToggle,
  keyFaces,
  keyFacesExpanded,
  onKeyFacesToggle,
  onKeyFaceTooltipChange,
}: CulledAlbumDetailSidebarProps) {
  const scrollStoreRef = useRef(createScrollAwareTooltipStore());
  const onKeyFaceTooltipChangeRef = useRef(onKeyFaceTooltipChange);
  onKeyFaceTooltipChangeRef.current = onKeyFaceTooltipChange;

  const keyFaceScrollHandlers = useScrollAwareTooltipHandlers(
    scrollStoreRef.current,
    () => onKeyFaceTooltipChangeRef.current(null),
    {trackWheelScroll: false},
  );

  const keyFaceRows = useMemo(
    () => (isMobileLayout ? [] : buildKeyFaceRows(keyFaces)),
    [isMobileLayout, keyFaces],
  );

  const handleSelectionFilterPress = useCallback(() => {
    onSelectionFilterChange(selectionFilter === 'selected' ? null : 'selected');
  }, [onSelectionFilterChange, selectionFilter]);

  const renderKeyFaceRow = useCallback(
    ({item}: ListRenderItemInfo<KeyFaceRow>) => (
      <KeyFaceGridRow
        row={item}
        onTooltipAnchorChange={onKeyFaceTooltipChangeRef.current}
      />
    ),
    [],
  );

  const renderKeyFaceItem = useCallback(
    ({item}: ListRenderItemInfo<KeyFaceWithSource>) => (
      <KeyFaceSidebarItem
        cropUri={item.cropUri}
        eyeStatus={item.eyeStatus}
        focusLevel={item.focusLevel}
        width={KEY_FACE_SIZE}
        onTooltipAnchorChange={onKeyFaceTooltipChangeRef.current}
      />
    ),
    [],
  );

  const keyExtractor = useCallback((face: KeyFaceWithSource) => face.faceId, []);

  const rowKeyExtractor = useCallback((row: KeyFaceRow) => row.key, []);

  const getKeyFaceRowLayout = useCallback(
    (_data: ArrayLike<KeyFaceRow> | null | undefined, index: number) => ({
      length: KEY_FACE_ROW_HEIGHT,
      offset: KEY_FACE_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  return (
    <View style={[styles.sidebar, isMobileLayout && styles.sidebarMobile]}>
      <Accordion
        title="Cull Filters"
        expanded={cullFiltersExpanded}
        onToggle={onCullFiltersToggle}
        style={styles.cullFiltersAccordion}>
        <View style={styles.accordionContent}>
          <View style={styles.totalPhotosBadge}>
            <Text style={styles.totalPhotosLabel}>Total Photos</Text>
            <Text style={styles.totalPhotosValue}>{totalPhotos}</Text>
          </View>
          <Pressable
            style={styles.mySelectionsRow}
            onPress={handleSelectionFilterPress}>
            {selectionFilter === 'selected' ? (
              <IconCheckCircle width={20} height={20} color={colors.text} />
            ) : (
              <IconCheckCircleOutline width={20} height={20} color={colors.text} />
            )}
            <Text style={styles.mySelectionsLabel}>My Selections</Text>
            <Text style={styles.mySelectionsCount}>{selectedCount}</Text>
          </Pressable>
          <View style={styles.sidebarDivider} />
          <View style={styles.filterRowContainer}>
            {(Object.keys(FILTER_LABELS) as CullFilterKey[]).map(key => (
              <Checkbox
                key={key}
                checked={activeFilters[key]}
                onToggle={() => onToggleFilter(key)}
                size={20}
                style={styles.filterRow}
                color={activeFilters[key] ? colors.accent : colors.text}>
                <Text style={styles.filterLabel}>{FILTER_LABELS[key]}</Text>
                <Text style={styles.filterCount}>{filterCounts[key]}</Text>
              </Checkbox>
            ))}
          </View>
        </View>
      </Accordion>

      <Accordion
        title={`Key Faces (${keyFaces.length})`}
        expanded={keyFacesExpanded}
        onToggle={onKeyFacesToggle}
        fill={!isMobileLayout}
        minContentHeight={isMobileLayout ? 120 : 200}
        style={styles.keyFacesAccordion}>
        <ScrollAwareTooltipContext.Provider value={scrollStoreRef.current}>
          {isMobileLayout ? (
            <FlatList
              {...keyFaceScrollHandlers}
              data={keyFaces}
              keyExtractor={keyExtractor}
              renderItem={renderKeyFaceItem}
              horizontal
              style={styles.keyFaceScroll}
              contentContainerStyle={styles.keyFaceGridMobile}
              showsHorizontalScrollIndicator
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={3}
              updateCellsBatchingPeriod={150}
              ItemSeparatorComponent={KeyFaceItemSeparator}
            />
          ) : (
            <FlatList
              {...keyFaceScrollHandlers}
              data={keyFaceRows}
              keyExtractor={rowKeyExtractor}
              renderItem={renderKeyFaceRow}
              style={styles.keyFaceScroll}
              contentContainerStyle={styles.keyFaceGrid}
              showsVerticalScrollIndicator
              initialNumToRender={5}
              maxToRenderPerBatch={3}
              windowSize={5}
              updateCellsBatchingPeriod={100}
              removeClippedSubviews={Platform.OS !== 'windows'}
              getItemLayout={getKeyFaceRowLayout}
            />
          )}
        </ScrollAwareTooltipContext.Provider>
      </Accordion>
    </View>
  );
}

function KeyFaceItemSeparator() {
  return <View style={styles.keyFaceItemSeparator} />;
}

export const CulledAlbumDetailSidebar = memo(CulledAlbumDetailSidebarComponent);

const styles = StyleSheet.create({
  sidebar: {
    width: 246,
    flexDirection: 'column',
    gap: 20,
    minHeight: 0,
    paddingVertical: 24,
  },
  sidebarMobile: {
    width: '100%',
    paddingVertical: 12,
    flex: undefined,
  },
  accordionContent: {
    gap: 16,
  },
  totalPhotosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackgroundSecondary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  totalPhotosLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  totalPhotosValue: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.text,
  },
  mySelectionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
  },
  mySelectionsLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  mySelectionsCount: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 4,
  },
  filterRowContainer: {
    paddingLeft: 12,
    gap: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  filterLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  filterCount: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
  keyFaceScroll: {
    flex: 1,
  },
  keyFaceGrid: {
    paddingRight: 20,
  },
  keyFaceGridMobile: {
    paddingRight: 0,
  },
  keyFaceRow: {
    flexDirection: 'row',
    gap: KEY_FACE_GAP,
    marginBottom: KEY_FACE_GAP,
  },
  keyFaceFiller: {
    width: KEY_FACE_SIZE,
    height: KEY_FACE_SIZE,
  },
  keyFaceItemSeparator: {
    width: KEY_FACE_GAP,
  },
  cullFiltersAccordion: {
    zIndex: 2,
  },
  keyFacesAccordion: {
    zIndex: 1,
  },
});
