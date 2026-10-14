import {usePrefetchSelectableSiteAlbums} from '@hooks/useSiteAlbumList';
import {colors} from '@lib/ui/colors';
import {
  InstantNavParams,
  uploadAwareModalScreenOptions,
  WithInstantNav,
} from '@lib/navigation/uploadAwareNavigation';
import {FileAsset} from '@services/api';
import {createStackNavigator} from '@react-navigation/stack';
import {Platform} from 'react-native';
import AlbumDetailScreen from '@screens/AlbumDetailScreen';
import CulledAlbumDetailScreen from '@screens/CulledAlbumDetailScreen';
import CulledAlbumPhotoDetailScreen from '@screens/CulledAlbumPhotoDetailScreen';
import HomeScreen from '@screens/HomeScreen';
import SelectAlbumScreen from '@screens/SelectAlbumScreen';

export type MainStackParamList = {
  Home: undefined;
  SelectAlbum: InstantNavParams | undefined;
  AlbumDetail: WithInstantNav<{
    albumId: string;
    albumName: string;
    ownerName: string;
    files?: FileAsset[];
    skipResumeImport?: boolean;
  }>;
  CulledAlbumDetail: WithInstantNav<{
    albumId: string;
    openUploadProgress?: boolean;
  }>;
  CulledAlbumPhotoDetail: WithInstantNav<{
    albumId: string;
    photoId: string;
    faceIndex?: number;
  }>;
};

const Stack = createStackNavigator<MainStackParamList>();

export function MainNavigator() {
  // Warm enough selectable albums so Select Album can scroll-paginate the rest.
  usePrefetchSelectableSiteAlbums();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: colors.background},
        animationTypeForReplace: 'push',
        freezeOnBlur: Platform.OS !== 'windows',
      }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="SelectAlbum"
        component={SelectAlbumScreen}
        options={uploadAwareModalScreenOptions}
      />
      <Stack.Screen
        name="AlbumDetail"
        component={AlbumDetailScreen}
        options={uploadAwareModalScreenOptions}
      />
      <Stack.Screen
        name="CulledAlbumDetail"
        component={CulledAlbumDetailScreen}
        options={uploadAwareModalScreenOptions}
      />
      <Stack.Screen
        name="CulledAlbumPhotoDetail"
        component={CulledAlbumPhotoDetailScreen}
        options={uploadAwareModalScreenOptions}
      />
    </Stack.Navigator>
  );
}
