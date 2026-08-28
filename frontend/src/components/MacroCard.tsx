import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow, macros } from '../theme';

type Props = { label: string; kind: 'protein' | 'carbs' | 'fat'; eaten: number; target: number };
export default function MacroCard({ label, kind, eaten, target }: Props) {
  const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
  const color = macros[kind];
  return (
    <View style={styles.card} testID={`macro-card-${kind}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}><Text style={{ color }}>{Math.round(eaten)}</Text><Text style={styles.total}>/{target}g</Text></Text>
      <View style={styles.barBg}>
        <View style={[styles.bar, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  value: { fontSize: 20, fontWeight: '800', color: colors.onSurface, marginTop: 4 },
  total: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  barBg: {
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 3,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: 3 },
});
