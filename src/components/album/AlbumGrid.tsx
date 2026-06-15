import {createContext, PropsWithChildren, useContext, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';

type AlbumGridContextValue = {
  itemWidth: number;
};

const AlbumGridContext = createContext<AlbumGridContextValue>({itemWidth: 0});

export function useAlbumGridItemWidth() {
  return useContext(AlbumGridContext).itemWidth;
}

type AlbumGridProps = PropsWithChildren<{
  columns?: number;
  gap?: number;
}>;

export function AlbumGrid({children, columns = 4, gap = 16}: AlbumGridProps) {
  const [itemWidth, setItemWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    const calculated = (width - (columns - 1) * gap) / columns;
    setItemWidth(calculated);
  }

  return (
    <AlbumGridContext.Provider value={{itemWidth}}>
      <View style={[styles.grid, {gap}]} onLayout={onLayout}>
        {itemWidth > 0 ? children : null}
      </View>
    </AlbumGridContext.Provider>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
