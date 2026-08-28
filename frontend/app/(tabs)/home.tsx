import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow, mealOrder, MealKey } from '@/src/theme';
import CalorieRing from '@/src/components/CalorieRing';
import MacroCard from '@/src/components/MacroCard';
import MealSection from '@/src/components/MealSection';
import DateStrip from '@/src/components/DateStrip';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

export default function Home() {
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/summary?date=${date}`);
      setSummary(j);
    } catch (e: any) {
      console.warn(e?.message);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const targets = summary?.targets || {};
  const totals = summary?.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const byMeal = summary?.by_meal || {};

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const removeLog = async (id: string) => {
    try { await apiFetch(`/logs/food/${id}`, { method: 'DELETE' }); await load(); } catch {}
  };

  const openSearch = (meal: MealKey) => router.push({ pathname: '/search', params: { meal, date } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.helloSm}>Today</Text>
          <Text style={styles.helloLg}>BiteRep</Text>
        </View>
        <Pressable onPress={() => router.push('/photo-food')} style={styles.camBtn} testID="header-camera-btn">
          <Ionicons name="camera-outline" size={22} color={colors.brand} />
        </Pressable>
      </View>
      <DateStrip selected={date} onSelect={setDate} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.ringCard}>
          <CalorieRing target={targets.target_calories || 2000} eaten={totals.calories} />
        </View>

        <View style={styles.macroRow}>
          <MacroCard label="Protein" kind="protein" eaten={totals.protein_g} target={targets.protein_g || 0} />
          <View style={{ width: 10 }} />
          <MacroCard label="Carbs" kind="carbs" eaten={totals.carbs_g} target={targets.carbs_g || 0} />
          <View style={{ width: 10 }} />
          <MacroCard label="Fat" kind="fat" eaten={totals.fat_g} target={targets.fat_g || 0} />
        </View>

        <Text style={styles.section}>Meals</Text>
        {mealOrder.map((m) => (
          <MealSection
            key={m}
            meal={m}
            dailyTarget={targets.target_calories || 2000}
            logs={byMeal[m] || []}
            onAdd={() => openSearch(m)}
            onRemove={removeLog}
          />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerBar: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, alignItems: 'center' },
  helloSm: { fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  helloLg: { fontSize: 26, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.5 },
  camBtn: { marginLeft: 'auto', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 100 },
  ringCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', ...shadow.card, marginBottom: spacing.md },
  macroRow: { flexDirection: 'row', marginBottom: spacing.lg },
  section: { fontSize: 18, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.sm, marginTop: 4 },
});
