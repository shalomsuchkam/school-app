// Jest globals for the type checker (TypeScript 6 no longer loads @types packages implicitly).
/// <reference types="jest" />

// Internal helper of the widget library (turns widget JSX into the tree it sends to Android), typed from its own .d.ts.
declare module 'react-native-android-widget/lib/commonjs/api/build-widget-tree' {
  export { buildWidgetTree } from 'react-native-android-widget/lib/typescript/api/build-widget-tree';
}
