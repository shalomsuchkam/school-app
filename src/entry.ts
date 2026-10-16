// App entry: Expo Router, plus the headless task that draws the Android home-screen widget.
import 'expo-router/entry';

import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widget/handler';

if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
