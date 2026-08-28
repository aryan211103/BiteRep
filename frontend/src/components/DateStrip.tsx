import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { todayStr, dateAdd } from '../units';

function build(dateStr: string) {
  const arr: string[] = [];
  for (let i = -6; i <= 0; i++) arr.push(dateAdd(dateStr, i));
  return arr;
}

type Props = { selected: string; onSelect: (d: string) => void };
export default function DateStrip({ selected, onSelect }: Props) {
  const days = build(todayStr());
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((d) => {
        const dt = new Date(d + 'T00:00:00');
        const isSel = d === selected;
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[styles.chip, isSel && styles.chipSel]}
            testID={`date-chip-${d}`}
          >
            <Text style={[styles.dow, isSel && styles.textSel]}>
              {dt.toLocaleDateString('en-US', { weekday: 'short' })[0]}
            </Text>
            <Text style={[styles.num, isSel && styles.textSel]}>{dt.getDate()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.sm },
  chip: {
    width: 46, height: 62, borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    flexShrink: 0,
  },
  chipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  dow: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  num: { fontSize: 18, color: colors.onSurface, fontWeight: '800', marginTop: 2 },
  textSel: { color: '#FFFFFF' },
});
