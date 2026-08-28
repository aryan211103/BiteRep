import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow, mealBudgetPct, mealLabel, MealKey } from '../theme';

type FoodLog = { id: string; name: string; brand?: string; grams: number; calories: number };

type Props = {
  meal: MealKey;
  dailyTarget: number;
  logs: FoodLog[];
  onAdd: () => void;
  onRemove: (id: string) => void;
};

export default function MealSection({ meal, dailyTarget, logs, onAdd, onRemove }: Props) {
  const budget = Math.round(dailyTarget * mealBudgetPct[meal]);
  const total = logs.reduce((s, l) => s + (l.calories || 0), 0);
  const pct = budget > 0 ? Math.min(total / budget, 1) : 0;
  return (
    <View style={styles.card} testID={`meal-section-${meal}`}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{mealLabel[meal]}</Text>
          <Text style={styles.sub}>{Math.round(total)} / {budget} kcal</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={onAdd} testID={`add-${meal}-btn`}>
          <Ionicons name="add" size={22} color={colors.brand} />
        </Pressable>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.bar, { width: `${pct * 100}%` }]} />
      </View>
      {logs.length > 0 && (
        <View style={{ marginTop: spacing.sm }}>
          {logs.map((l) => (
            <Pressable
              key={l.id}
              onLongPress={() => onRemove(l.id)}
              style={styles.item}
              testID={`log-item-${l.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{l.name}</Text>
                <Text style={styles.itemSub}>{Math.round(l.grams)} g{l.brand ? ` · ${l.brand}` : ''}</Text>
              </View>
              <Text style={styles.itemKcal}>{Math.round(l.calories)} kcal</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: '600' },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  barBg: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: colors.brand, borderRadius: 3 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider ?? '#F3F4F6' },
  itemName: { fontSize: 14, color: colors.onSurface, fontWeight: '600' },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  itemKcal: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
});
