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

export default function Workout() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newName, setNewName] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');

  useEffect(() => {
    (async () => {
      try {
        const [w, me] = await Promise.all([apiFetch('/logs/workout'), apiFetch('/me')]);
        setHistory(w.logs);
        setUnit(me?.profile?.unit_system || 'imperial');
      } catch {}
    })();
  }, []);

  const addExercise = () => {
    if (!newName.trim()) return;
    setExercises((es) => [...es, { name: newName.trim(), sets: [{ reps: '8', weight: '' }] }]);
    setNewName('');
  };
  const addSet = (i: number) => setExercises((es) => es.map((e, idx) => idx === i ? { ...e, sets: [...e.sets, { reps: '8', weight: e.sets[e.sets.length - 1]?.weight || '' }] } : e));
  const updateSet = (i: number, si: number, key: 'reps' | 'weight', v: string) =>
    setExercises((es) => es.map((e, idx) => idx === i ? { ...e, sets: e.sets.map((s, j) => j === si ? { ...s, [key]: v } : s) } : e));
  const removeEx = (i: number) => setExercises((es) => es.filter((_, idx) => idx !== i));

  const save = async () => {
    if (exercises.length === 0) return;
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
      router.back();
    } catch (e) { console.warn(e); }
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
        <Pressable onPress={save} style={[styles.saveBtn, exercises.length === 0 && { opacity: 0.4 }]} disabled={exercises.length === 0} testID="wk-save">
          <Text style={styles.saveTxt}>Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {exercises.map((e, i) => (
          <View key={i} style={styles.card} testID={`wk-ex-${i}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.exName}>{e.name}</Text>
              <Pressable onPress={() => removeEx(i)} style={{ marginLeft: 'auto' }}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
            <View style={styles.setHead}>
              <Text style={[styles.setHeadTxt, { flex: 1 }]}>Set</Text>
              <Text style={[styles.setHeadTxt, { flex: 2 }]}>Reps</Text>
              <Text style={[styles.setHeadTxt, { flex: 2 }]}>{unitLbl}</Text>
            </View>
            {e.sets.map((s, si) => (
              <View key={si} style={styles.setRow}>
                <Text style={[styles.setIdx, { flex: 1 }]}>#{si + 1}</Text>
                <TextInput value={s.reps} onChangeText={(v) => updateSet(i, si, 'reps', v)} keyboardType="number-pad" style={[styles.setInput, { flex: 2 }]} testID={`wk-reps-${i}-${si}`} />
                <TextInput value={s.weight} onChangeText={(v) => updateSet(i, si, 'weight', v)} keyboardType="decimal-pad" style={[styles.setInput, { flex: 2 }]} placeholder="0" testID={`wk-wt-${i}-${si}`} />
              </View>
            ))}
            <Pressable onPress={() => addSet(i)} style={styles.addSetBtn} testID={`wk-add-set-${i}`}>
              <Ionicons name="add" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Add set</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.addExRow}>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Add exercise (e.g. Bench press)" style={styles.newEx} testID="wk-new-name" />
          <Pressable onPress={addExercise} style={styles.addExBtn} testID="wk-add-ex">
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

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
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  exName: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  setHead: { flexDirection: 'row', marginTop: 12, marginBottom: 6 },
  setHeadTxt: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  setIdx: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  setInput: { backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 10, fontSize: 15, color: colors.onSurface },
  addSetBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 8, paddingVertical: 6 },
  addExRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  newEx: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  addExBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  statCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: 8, ...shadow.card },
  statName: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
});
