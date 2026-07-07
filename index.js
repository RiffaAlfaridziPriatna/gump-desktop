const ReactNative = require('react-native');

if (ReactNative.Platform?.OS && ReactNative.Platform.OS !== 'windows') {
  require('react-native-gesture-handler');
}

const App = require('./src/app/App').default;
const {name: appName} = require('./app.json');

ReactNative.AppRegistry.registerComponent(appName, () => App);
