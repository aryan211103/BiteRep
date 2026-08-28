import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, macros } from '../theme';

type Props = {
  size?: number;
  stroke?: number;
  target: number;
  eaten: number;
};
export default function CalorieRing({ size = 220, stroke = 18, target, eaten }: Props) {
  const remaining = Math.max(target - eaten, 0);
  const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }} testID="calorie-ring">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceTertiary} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.brand}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.num} testID="calorie-remaining">{Math.round(remaining)}</Text>
        <Text style={styles.label}>kcal left</Text>
        <Text style={styles.sub}>{Math.round(eaten)} / {target}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center' },
  num: { fontSize: 48, fontWeight: '800', color: colors.onSurface, letterSpacing: -1 },
  label: { fontSize: 14, color: colors.muted, marginTop: -2 },
  sub: { fontSize: 12, color: colors.mutedStrong, marginTop: 6, fontWeight: '600' },
});
