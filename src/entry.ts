// App entry: Expo Router, plus the headless task that draws the Android home-screen widget.
// Register background tasks before Router mounts a screen. Headless launches never
// render GeoPanel, so importing geo only from that component loses task deliveries.
import './lib/geo';
import 'expo-router/entry';

import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widget/handler';

if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
