import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr, lbsToKg, kgToLbs } from '@/src/units';

type Set = { reps: string; weight: string };
type Exercise = { name: string; sets: Set[] };

const EXERCISE_CATALOG: Record<string, string[]> = {
  Chest: ['Bench Press', 'Incline Bench Press', 'Push-up', 'Chest Fly', 'Dumbbell Press'],
  Back: ['Deadlift', 'Pull-up', 'Lat Pulldown', 'Barbell Row', 'Seated Row'],
  Legs: ['Squat', 'Leg Press', 'Lunge', 'Leg Curl', 'Calf Raise', 'Romanian Deadlift'],
  Shoulders: ['Overhead Press', 'Lateral Raise', 'Front Raise', 'Arnold Press', 'Face Pull'],
  Arms: ['Bicep Curl', 'Tricep Extension', 'Hammer Curl', 'Skull Crusher', 'Tricep Dip'],
  Core: ['Plank', 'Crunch', 'Russian Twist', 'Leg Raise', 'Sit-up'],
};
const CATEGORIES = Object.keys(EXERCISE_CATALOG);
const ALL_EXERCISES = CATEGORIES.flatMap((cat) => EXERCISE_CATALOG[cat].map((name) => ({ name, cat })));

const formatDate = (d: string) => {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
};

export default function Workout() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newName, setNewName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [history, setHistory] = useState<any[]>([]);
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadHistory = async () => {
    try {
      const w = await apiFetch('/logs/workout');
      setHistory(w.logs || []);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch('/me');
        setUnit(me?.profile?.unit_system || 'imperial');
      } catch {}
      await loadHistory();
    })();
  }, []);

  const addExercise = (nameOverride?: string) => {
    const nm = (nameOverride ?? newName).trim();
    if (!nm) return;
    setExercises((es) => [...es, { name: nm, sets: [{ reps: '8', weight: '' }] }]);
    setNewName('');
  };
  const addSet = (i: number) => setExercises((es) => es.map((e, idx) => idx === i ? { ...e, sets: [...e.sets, { reps: '8', weight: e.sets[e.sets.length - 1]?.weight || '' }] } : e));
  const updateSet = (i: number, si: number, key: 'reps' | 'weight', v: string) =>
    setExercises((es) => es.map((e, idx) => idx === i ? { ...e, sets: e.sets.map((s, j) => j === si ? { ...s, [key]: v } : s) } : e));
  const removeSet = (i: number, si: number) =>
    setExercises((es) => es.map((e, idx) => idx === i ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e));
  const removeEx = (i: number) => setExercises((es) => es.filter((_, idx) => idx !== i));

  const suggestions = newName.trim().length > 0
    ? ALL_EXERCISES.filter((e) => e.name.toLowerCase().includes(newName.trim().toLowerCase())).slice(0, 6)
    : [];

  const save = async () => {
    if (exercises.length === 0 || saving) return;
    setSaving(true);
    const payload = {
      date: todayStr(),
      exercises: exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((s) => ({
          reps: Number(s.reps) || 0,
          weight_kg: unit === 'imperial' ? lbsToKg(Number(s.weight) || 0) : (Number(s.weight) || 0),
          done: true,
        })),
      })),
    };
    try {
      await apiFetch('/logs/workout', { method: 'POST', body: JSON.stringify(payload) });
      setExercises([]);
      await loadHistory();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

  // Compute top weight & est 1RM per exercise across history
  const stats: Record<string, { top: number; volume: number; oneRM: number }> = {};
  for (const w of history) {
    for (const ex of w.exercises || []) {
      const s = stats[ex.name] || { top: 0, volume: 0, oneRM: 0 };
      for (const st of ex.sets || []) {
        const kg = st.weight_kg || 0;
        s.top = Math.max(s.top, kg);
        s.volume += kg * (st.reps || 0);
        const rm = kg * (1 + (st.reps || 0) / 30);
        s.oneRM = Math.max(s.oneRM, rm);
      }
      stats[ex.name] = s;
    }
  }
  const unitLbl = unit === 'imperial' ? 'lb' : 'kg';
  const toDisp = (kg: number) => unit === 'imperial' ? Math.round(kgToLbs(kg)) : Math.round(kg);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="wk-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Workout</Text>
        <Pressable onPress={save} style={[styles.saveBtn, exercises.length === 0 && { opacity: 0.4 }]} disabled={exercises.length === 0 || saving} testID="wk-save">
          <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {savedFlash && (
          <View style={styles.flashCard} testID="wk-saved-flash">
            <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
            <Text style={styles.flashTxt}>Workout saved to your history</Text>
          </View>
        )}

        {exercises.map((e, i) => (
          <View key={i} style={styles.card} testID={`wk-ex-${i}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.exName}>{e.name}</Text>
              <Pressable onPress={() => removeEx(i)} style={{ marginLeft: 'auto', padding: 6 }} testID={`wk-remove-ex-${i}`}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
            <View style={styles.setHead}>
              <Text style={[styles.setHeadTxt, { flex: 1 }]}>Set</Text>
              <Text style={[styles.setHeadTxt, { flex: 2 }]}>Reps</Text>
              <Text style={[styles.setHeadTxt, { flex: 2 }]}>{unitLbl}</Text>
              <View style={{ width: 28 }} />
            </View>
            {e.sets.map((s, si) => (
              <View key={si} style={styles.setRow}>
                <Text style={[styles.setIdx, { flex: 1 }]}>#{si + 1}</Text>
                <TextInput value={s.reps} onChangeText={(v) => updateSet(i, si, 'reps', v)} keyboardType="number-pad" style={[styles.setInput, { flex: 2 }]} testID={`wk-reps-${i}-${si}`} />
                <TextInput value={s.weight} onChangeText={(v) => updateSet(i, si, 'weight', v)} keyboardType="decimal-pad" style={[styles.setInput, { flex: 2 }]} placeholder="0" testID={`wk-wt-${i}-${si}`} />
                <Pressable onPress={() => removeSet(i, si)} style={{ width: 28, alignItems: 'center' }} testID={`wk-remove-set-${i}-${si}`}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => addSet(i)} style={styles.addSetBtn} testID={`wk-add-set-${i}`}>
              <Ionicons name="add" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Add set</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.section}>Add exercise</Text>
        <View style={styles.addExRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Search or type an exercise"
            style={styles.newEx}
            testID="wk-new-name"
            onSubmitEditing={() => addExercise()}
            returnKeyType="done"
          />
          <Pressable onPress={() => addExercise()} style={styles.addExBtn} testID="wk-add-ex">
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        {suggestions.length > 0 ? (
          <View style={styles.suggestBox}>
            {suggestions.map((s) => (
              <Pressable key={s.name} onPress={() => addExercise(s.name)} style={styles.suggestRow} testID={`wk-suggest-${s.name.replace(/\s+/g, '-')}`}>
                <Text style={styles.suggestName}>{s.name}</Text>
                <Text style={styles.suggestCat}>{s.cat}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {CATEGORIES.map((cat) => (
                <Pressable key={cat} onPress={() => setCategory(cat)} style={[styles.catChip, category === cat && styles.catChipSel]} testID={`wk-cat-${cat}`}>
                  <Text style={[styles.catChipTxt, category === cat && { color: '#fff' }]}>{cat}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EXERCISE_CATALOG[category].map((name) => (
                <Pressable key={name} onPress={() => addExercise(name)} style={styles.exChip} testID={`wk-exchip-${name.replace(/\s+/g, '-')}`}>
                  <Text style={styles.exChipTxt}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {Object.keys(stats).length > 0 && (
          <>
            <Text style={styles.section}>Progression</Text>
            {Object.entries(stats).map(([name, s]) => (
              <View key={name} style={styles.statCard}>
                <Text style={styles.statName}>{name}</Text>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <StatBox lbl="Top" v={`${toDisp(s.top)} ${unitLbl}`} />
                  <StatBox lbl="Est. 1RM" v={`${toDisp(s.oneRM)} ${unitLbl}`} />
                  <StatBox lbl="Volume" v={`${toDisp(s.volume)} ${unitLbl}`} />
                </View>
              </View>
            ))}
          </>
        )}

        {history.length > 0 && (
          <>
            <Text style={styles.section}>History</Text>
            {history.map((w, idx) => (
              <View key={w.id || idx} style={styles.historyCard} testID={`wk-history-${idx}`}>
                <Text style={styles.historyDate}>{formatDate(w.date)}</Text>
                {(w.exercises || []).map((ex: any, i: number) => (
                  <View key={i} style={styles.historyExRow}>
                    <Text style={styles.historyExName} numberOfLines={1}>{ex.name}</Text>
                    <Text style={styles.historyExSets} numberOfLines={1}>
                      {(ex.sets || []).map((s: any) => `${s.reps}×${toDisp(s.weight_kg)}${unitLbl}`).join('  ')}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {history.length === 0 && exercises.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="barbell-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyTxt}>No workouts logged yet. Add an exercise above to get started.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ lbl, v }: { lbl: string; v: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary, padding: 10, borderRadius: 12, marginRight: 6, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' }}>{lbl}</Text>
      <Text style={{ fontSize: 15, color: colors.onSurface, fontWeight: '800', marginTop: 2 }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.md, gap: 12, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface, flex: 1 },
  saveBtn: { paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800' },
  flashCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandLight, borderRadius: radius.lg, padding: 12, marginBottom: spacing.md },
  flashTxt: { color: colors.brandDark, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  exName: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  setHead: { flexDirection: 'row', marginTop: 12, marginBottom: 6 },
  setHeadTxt: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  setIdx: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  setInput: { backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 10, fontSize: 15, color: colors.onSurface },
  addSetBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 8, paddingVertical: 6 },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  addExRow: { flexDirection: 'row', gap: 8 },
  newEx: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  addExBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  suggestBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginTop: 8, ...shadow.card, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestName: { fontSize: 14, color: colors.onSurface, fontWeight: '700' },
  suggestCat: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  catChip: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  catChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  catChipTxt: { color: colors.onSurface, fontWeight: '700', fontSize: 12 },
  exChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  exChipTxt: { color: colors.onSurface, fontWeight: '600', fontSize: 13 },
  statCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: 8, ...shadow.card },
  statName: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  historyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: 8, ...shadow.card },
  historyDate: { fontSize: 13, fontWeight: '800', color: colors.brand, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  historyExRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5 },
  historyExName: { fontSize: 14, color: colors.onSurface, fontWeight: '700', flex: 1 },
  historyExSets: { fontSize: 12, color: colors.muted, fontWeight: '600', flexShrink: 0 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});
