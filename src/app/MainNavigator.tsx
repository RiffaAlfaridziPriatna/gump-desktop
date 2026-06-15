import {colors} from '@lib/colors';
import {createStackNavigator, TransitionPresets} from '@react-navigation/stack';
import HomeScreen from '@screens/HomeScreen';
import SelectAlbumScreen from '@screens/SelectAlbumScreen';

export type MainStackParamList = {
  Home: undefined;
  SelectAlbum: undefined;
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
    </Stack.Navigator>
  );
}
