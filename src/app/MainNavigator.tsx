import {colors} from '@lib/colors';
import {FileAsset} from '@services/api';
import {createStackNavigator, TransitionPresets} from '@react-navigation/stack';
import AlbumDetailScreen from '@screens/AlbumDetailScreen';
import CulledAlbumDetailScreen from '@screens/CulledAlbumDetailScreen';
import CulledAlbumPhotoDetailScreen from '@screens/CulledAlbumPhotoDetailScreen';
import HomeScreen from '@screens/HomeScreen';
import SelectAlbumScreen from '@screens/SelectAlbumScreen';

export type MainStackParamList = {
  Home: undefined;
  SelectAlbum: undefined;
  AlbumDetail: {
    albumId: string;
    albumName: string;
    ownerName: string;
    files?: FileAsset[];
  };
  CulledAlbumDetail: {
    albumId: string;
  };
  CulledAlbumPhotoDetail: {
    albumId: string;
    photoId: string;
  };
};

const Stack = createStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="SelectAlbum"
        component={SelectAlbumScreen}
        options={{
          animation: 'slide_from_bottom',
          ...TransitionPresets.ModalSlideFromBottomIOS,
          cardOverlayEnabled: true,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="AlbumDetail"
        component={AlbumDetailScreen}
        options={{
          animation: 'slide_from_bottom',
          ...TransitionPresets.ModalSlideFromBottomIOS,
          cardOverlayEnabled: true,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="CulledAlbumDetail"
        component={CulledAlbumDetailScreen}
        options={{
          animation: 'slide_from_bottom',
          ...TransitionPresets.ModalSlideFromBottomIOS,
          cardOverlayEnabled: true,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="CulledAlbumPhotoDetail"
        component={CulledAlbumPhotoDetailScreen}
        options={{
          animation: 'slide_from_bottom',
          ...TransitionPresets.ModalSlideFromBottomIOS,
          cardOverlayEnabled: true,
          gestureEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
}
