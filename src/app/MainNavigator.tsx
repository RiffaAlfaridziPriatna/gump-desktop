import {colors} from '@lib/colors';
import {FileAsset} from '@services/api';
import {createStackNavigator, TransitionPresets} from '@react-navigation/stack';
import AlbumDetailScreen from '@screens/AlbumDetailScreen';
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
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
    </Stack.Navigator>
  );
}
