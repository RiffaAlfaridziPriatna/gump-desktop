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
import CulledAlbumUploadProgressScreen from '@screens/CulledAlbumUploadProgressScreen';
import CulledAlbumUploadSuccessScreen from '@screens/CulledAlbumUploadSuccessScreen';
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
  }>;
  CulledAlbumPhotoDetail: WithInstantNav<{
    albumId: string;
    photoId: string;
  }>;
  CulledAlbumUploadProgress: WithInstantNav<{
    albumId: string;
    photoCount: number;
    albumName: string;
    albumLink: string;
  }>;
  CulledAlbumUploadSuccess: WithInstantNav<{
    albumId: string;
    albumName: string;
    albumLink: string;
  }>;
};

const Stack = createStackNavigator<MainStackParamList>();

export function MainNavigator() {
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
      <Stack.Screen
        name="CulledAlbumUploadProgress"
        component={CulledAlbumUploadProgressScreen}
        options={uploadAwareModalScreenOptions}
      />
      <Stack.Screen
        name="CulledAlbumUploadSuccess"
        component={CulledAlbumUploadSuccessScreen}
        options={uploadAwareModalScreenOptions}
      />
    </Stack.Navigator>
  );
}
