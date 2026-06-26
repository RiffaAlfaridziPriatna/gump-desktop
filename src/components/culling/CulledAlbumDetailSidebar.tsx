import {KeyFaceSidebarItem} from '@components/culling/KeyFaceSidebarItem';
import {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {Accordion} from '@components/ui/Accordion';
import {Checkbox, Pressable} from '@components/ui';
import {resolveKeyFaceSource} from '@lib/cullingFaceCrop';
import {SelectionFilter} from '@lib/culling/culledAlbumPhotoFilters';
import {CullFilterKey} from '@lib/culling/cullingUtil';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {
  ScrollAwareTooltipContext,
  createScrollAwareTooltipStore,
  useScrollAwareTooltipHandlers,
} from '@lib/scrollAwareTooltip';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {memo, useCallback, useRef} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';

const FILTER_LABELS: Record<CullFilterKey, string> = {
  aiSelected: 'AI Selected',
  maybe: 'Maybe',
  blurred: 'Blurred',
  closedEyes: 'Closed Eyes',
  duplicated: 'Duplicated',
};

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
  keyFaces: APIResponse.CullingKeyFace[];
  keyFacesExpanded: boolean;
  onKeyFacesToggle: () => void;
  analyzedPhotoList: APIResponse.CullingPhoto[];
  filesByPhotoId: Map<string, FileAsset>;
  onKeyFaceTooltipChange: (anchor: KeyFaceTooltipAnchor | null) => void;
};

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
  analyzedPhotoList,
  filesByPhotoId,
  onKeyFaceTooltipChange,
}: CulledAlbumDetailSidebarProps) {
  const scrollStoreRef = useRef(createScrollAwareTooltipStore());
  const keyFaceScrollHandlers = useScrollAwareTooltipHandlers(
    scrollStoreRef.current,
    () => onKeyFaceTooltipChange(null),
  );

  const handleSelectionFilterPress = useCallback(() => {
    onSelectionFilterChange(selectionFilter === 'selected' ? null : 'selected');
  }, [onSelectionFilterChange, selectionFilter]);

  return (
    <View style={[styles.sidebar, isMobileLayout && styles.sidebarMobile]}>
      <Accordion
        title="Cull Filters"
        expanded={cullFiltersExpanded}
        onToggle={onCullFiltersToggle}>
        <View style={styles.accordionContent}>
          <View style={styles.totalPhotosBadge}>
            <Text style={styles.totalPhotosLabel}>Total Photos</Text>
            <Text style={styles.totalPhotosValue}>{totalPhotos}</Text>
          </View>
          <Pressable
            style={[
              styles.mySelectionsRow,
              selectionFilter === 'selected' && styles.mySelectionsRowSelected,
            ]}
            onPress={handleSelectionFilterPress}>
            <IconCheckCircle width={20} height={20} color={colors.text} />
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
          <ScrollView
            {...keyFaceScrollHandlers}
            horizontal={isMobileLayout}
            style={styles.keyFaceScroll}
            contentContainerStyle={[
              styles.keyFaceGrid,
              isMobileLayout && styles.keyFaceGridMobile,
            ]}
            showsVerticalScrollIndicator={!isMobileLayout}
            showsHorizontalScrollIndicator={isMobileLayout}>
            {keyFaces.map(face => {
              const source = resolveKeyFaceSource(
                face,
                analyzedPhotoList,
                filesByPhotoId,
              );

              return (
                <KeyFaceSidebarItem
                  key={face.faceId}
                  uri={source?.uri}
                  boundingBox={source?.boundingBox}
                  eyeStatus={face.eyeStatus}
                  focusLevel={face.focusLevel}
                  width={64}
                  onTooltipAnchorChange={onKeyFaceTooltipChange}
                />
              );
            })}
          </ScrollView>
        </ScrollAwareTooltipContext.Provider>
      </Accordion>
    </View>
  );
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
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.text,
  },
  mySelectionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.2,
    paddingLeft: 12,
  },
  mySelectionsRowSelected: {
    opacity: 1,
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
    overflow: 'visible',
  },
  keyFaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingRight: 20,
    gap: 16,
  },
  keyFaceGridMobile: {
    flexWrap: 'nowrap',
    paddingRight: 0,
  },
  keyFacesAccordion: {
    overflow: 'visible',
  },
});
