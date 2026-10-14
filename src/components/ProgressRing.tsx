import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Txt } from './ui';

export function ProgressRing({ done, total, size = 96 }: { done: number; total: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.min(1, done / total) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - frac)} />
      </Svg>
      <Txt v="title" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
        {done}/{total}
      </Txt>
    </View>
  );
}
