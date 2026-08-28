import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, radius, spacing, shadow } from '../theme';
import { todayStr, dateAdd } from '../units';

function build(dateStr: string) {
  const arr: string[] = [];
  for (let i = -6; i <= 0; i++) arr.push(dateAdd(dateStr, i));
  return arr;
}

type Props = { selected: string; onSelect: (d: string) => void };
export default function DateStrip({ selected, onSelect }: Props) {
  const days = build(todayStr());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {days.map((d) => {
          const dt = new Date(d + 'T00:00:00');
          const isSel = d === selected;
          const isToday = d === todayStr();
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
              {isToday && !isSel && <View style={styles.todayDot} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 86 },
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: spacing.lg, gap: 8, alignItems: 'center', paddingVertical: spacing.sm },
  chip: {
    width: 48, height: 66, borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    flexShrink: 0,
    ...shadow.card,
  },
  chipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  dow: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  num: { fontSize: 18, color: colors.onSurface, fontWeight: '800', marginTop: 2 },
  textSel: { color: '#FFFFFF' },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.brand, marginTop: 4 },
});
