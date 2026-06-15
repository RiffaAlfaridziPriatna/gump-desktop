import {colors} from '@lib/colors';
import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '@screens/HomeScreen';

export type MainStackParamList = {
  Home: undefined;
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
    </Stack.Navigator>
  );
}
