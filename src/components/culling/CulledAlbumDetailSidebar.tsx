import { AiCategoriesSection } from '@components/culling/AiCategoriesSection';
import {
  FacesInPhotoPanel,
  type FacesInPhotoPanelPhoto,
} from '@components/culling/FacesInPhotoPanel';
import { PhotoFiltersSection } from '@components/culling/PhotoFiltersSection';
import { SidebarActionStack } from '@components/culling/SidebarActionStack';
import { SelectionFilter } from '@lib/culling/culledAlbumPhotoFilters';
import { CullFilterKey } from '@lib/culling/cullingUtil';
import { colors } from '@lib/ui/colors';
import { memo, useCallback, type Ref } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

export type CulledAlbumDetailSidebarProps = {
  isMobileLayout: boolean;
  totalPhotos: number;
  actionCount: number;
  selectionFilter: SelectionFilter;
  hasActiveFilter: boolean;
  onSelectionFilterChange: (filter: SelectionFilter) => void;
  onClearFilters: () => void;
  activeFilters: Record<CullFilterKey, boolean>;
  onToggleFilter: (key: CullFilterKey) => void;
  filterCounts: Record<CullFilterKey, number>;
  cullFiltersExpanded: boolean;
  onCullFiltersToggle: () => void;
  focusedPhoto: FacesInPhotoPanelPhoto | null;
  onUploadSelected: () => void;
  onAddPhotos?: () => void;
  onExport: () => void;
  onEditPhotos: () => void;
  editPhotosRef?: Ref<View>;
  uploaded?: boolean;
  uploadDisabled?: boolean;
  uploadIncludesHidden?: boolean;
  addPhotosDisabled?: boolean;
  exportDisabled?: boolean;
  editPhotosDisabled?: boolean;
};

function CulledAlbumDetailSidebarComponent({
  isMobileLayout,
  totalPhotos,
  actionCount,
  selectionFilter,
  hasActiveFilter,
  onSelectionFilterChange,
  onClearFilters,
  activeFilters,
  onToggleFilter,
  filterCounts,
  cullFiltersExpanded,
  onCullFiltersToggle,
  focusedPhoto,
  ...actionProps
}: CulledAlbumDetailSidebarProps) {
  const handleTogglePicked = useCallback(
    () =>
      onSelectionFilterChange(selectionFilter === 'selected' ? null : 'selected'),
    [onSelectionFilterChange, selectionFilter],
  );

  return (
    <View style={[styles.sidebar, isMobileLayout && styles.sidebarMobile]}>
      <SidebarActionStack actionCount={actionCount} {...actionProps} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={!isMobileLayout}>
        <PhotoFiltersSection
          expanded={cullFiltersExpanded}
          onToggle={onCullFiltersToggle}
          totalCount={totalPhotos}
          pickedCount={actionCount}
          selectionFilter={selectionFilter}
          hasActiveFilter={hasActiveFilter}
          onShowAll={onClearFilters}
          onTogglePicked={handleTogglePicked}
        />
        <View style={styles.divider} />
        <AiCategoriesSection
          activeFilters={activeFilters}
          filterCounts={filterCounts}
          onToggleFilter={onToggleFilter}
        />
        <View style={styles.divider} />
        <FacesInPhotoPanel photo={focusedPhoto} />
      </ScrollView>
    </View>
  );
}

export const CulledAlbumDetailSidebar = memo(CulledAlbumDetailSidebarComponent);

const styles = StyleSheet.create({
  sidebar: {
    width: 246,
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: 20,
    minHeight: 0,
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 0,
  },
  sidebarMobile: {
    width: '100%',
    alignSelf: undefined,
    overflow: undefined,
    paddingTop: 12,
    paddingBottom: 12,
    flex: undefined,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 40,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
});
