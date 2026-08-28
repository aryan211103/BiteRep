import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow, mealOrder, mealLabel, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

export default function Recipes() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [meal, setMeal] = useState<MealKey>('lunch');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const j = await apiFetch('/recipes');
      setRecipes(j.recipes || []);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const relog = async () => {
    if (!active || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/recipes/${active.id}/relog`, {
        method: 'POST',
        body: JSON.stringify({ date: todayStr(), meal }),
      });
      setActive(null);
      router.replace('/(tabs)/home');
    } catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/recipes/${id}`, { method: 'DELETE' });
      setRecipes((rs) => rs.filter((r) => r.id !== id));
    } catch (e) { console.warn(e); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="recipes-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>My Recipes</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />}
        {!loading && recipes.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="bookmark-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyTxt}>No saved recipes yet. Log a meal on Home, then tap Save as recipe under any meal section.</Text>
          </View>
        )}
        {recipes.map((r) => (
          <View key={r.id} style={styles.card} testID={`recipe-${r.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recName}>{r.name}</Text>
                <Text style={styles.recSub}>{(r.items || []).length} item{(r.items || []).length === 1 ? '' : 's'} · {r.totals?.calories || 0} kcal</Text>
              </View>
              <Pressable onPress={() => remove(r.id)} style={{ padding: 6 }} testID={`recipe-delete-${r.id}`}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
            <Pressable onPress={() => { setActive(r); setMeal('lunch'); }} style={styles.relogBtn} testID={`recipe-relog-${r.id}`}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.relogTxt}>Log again</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Modal transparent animationType="fade" visible={!!active} onRequestClose={() => setActive(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log {active?.name} to…</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {mealOrder.map((m) => (
                <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mChip, meal === m && styles.mChipSel]} testID={`recipe-meal-${m}`}>
                  <Text style={[styles.mChipT, meal === m && { color: '#fff' }]}>{mealLabel[m]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable onPress={() => setActive(null)} style={styles.modalCancel} testID="recipe-relog-cancel">
                <Text style={{ color: colors.onSurface, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={relog} style={styles.modalSave} disabled={busy} testID="recipe-relog-confirm">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.md, gap: 12, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, ...shadow.card },
  recName: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  recSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  relogBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 10, marginTop: 10 },
  relogTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, width: '100%', ...shadow.cardStrong },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  mChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mChipT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: 'center' },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center' },
});
