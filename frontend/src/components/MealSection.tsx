import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow, mealBudgetPct, mealLabel, MealKey } from '../theme';
import { apiFetch } from '../api';

type FoodLog = {
  id: string; name: string; brand?: string; grams: number; calories: number;
  protein_g?: number; carbs_g?: number; fat_g?: number;
};

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
  const [recipeModal, setRecipeModal] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [saving, setSaving] = useState(false);

  const saveRecipe = async () => {
    if (!recipeName.trim() || saving) return;
    setSaving(true);
    try {
      await apiFetch('/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: recipeName.trim(),
          items: logs.map((l) => ({
            name: l.name,
            brand: l.brand || '',
            grams: l.grams,
            calories: l.calories,
            protein_g: l.protein_g || 0,
            carbs_g: l.carbs_g || 0,
            fat_g: l.fat_g || 0,
          })),
        }),
      });
      setRecipeModal(false);
      setRecipeName('');
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

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
          <Pressable onPress={() => setRecipeModal(true)} style={styles.recipeLink} testID={`save-recipe-${meal}`}>
            <Ionicons name="bookmark-outline" size={14} color={colors.brand} />
            <Text style={styles.recipeLinkTxt}>Save as recipe</Text>
          </Pressable>
        </View>
      )}

      <Modal transparent animationType="fade" visible={recipeModal} onRequestClose={() => setRecipeModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save {mealLabel[meal]} as a recipe</Text>
            <Text style={styles.modalSub}>Re-log this whole meal with one tap next time.</Text>
            <TextInput
              value={recipeName}
              onChangeText={setRecipeName}
              placeholder="e.g. My usual breakfast"
              style={styles.modalInput}
              testID="recipe-name-input"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setRecipeModal(false)} style={styles.modalCancel} testID="recipe-cancel">
                <Text style={{ color: colors.onSurface, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveRecipe} style={[styles.modalSave, !recipeName.trim() && { opacity: 0.5 }]} disabled={!recipeName.trim() || saving} testID="recipe-save">
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  barBg: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: colors.brand, borderRadius: 3 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider ?? '#F3F4F6' },
  itemName: { fontSize: 14, color: colors.onSurface, fontWeight: '600' },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  itemKcal: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  recipeLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  recipeLinkTxt: { fontSize: 12, fontWeight: '700', color: colors.brand },
  modalBackdrop: { flex: 1, backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, width: '100%', ...shadow.cardStrong },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  modalSub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  modalInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 12, fontSize: 15, marginTop: 12, color: colors.onSurface },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: 'center' },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center' },
});

