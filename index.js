import {AppRegistry, Platform} from 'react-native';

if (Platform.OS !== 'windows') {
  require('react-native-gesture-handler');
}

import App from './src/app/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
