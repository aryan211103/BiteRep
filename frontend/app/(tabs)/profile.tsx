import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch, clearIds } from '@/src/api';

export default function Profile() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [override, setOverride] = useState('');
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');

  const load = async () => {
    try {
      const j = await apiFetch('/me');
      setMe(j);
      setUnit(j?.profile?.unit_system || 'imperial');
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const saveOverride = async () => {
    const kcal = Number(override);
    if (!kcal) return;
    try {
      await apiFetch('/profile', { method: 'PATCH', body: JSON.stringify({ targets: { target_calories: kcal } }) });
      setOverride(''); load();
    } catch {}
  };

  const toggleUnit = async () => {
    const next = unit === 'imperial' ? 'metric' : 'imperial';
    setUnit(next);
    try { await apiFetch('/profile', { method: 'PATCH', body: JSON.stringify({ profile: { unit_system: next } }) }); } catch {}
  };

  const reset = async () => {
    await clearIds();
    router.replace('/');
  };

  const p = me?.profile || {};
  const t = me?.targets || {};

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Profile</Text>

        <View style={styles.card}>
          <Row icon="person" label="Name" value={p.name || '—'} />
          <Row icon="body" label="Sex / Age" value={`${p.sex || '—'} · ${p.age || '—'}`} />
          <Row icon="flame" label="Goal" value={(p.goal || '').replace('_', ' ')} />
          <Row icon="fitness" label="Activity" value={p.activity || '—'} />
        </View>

        <Text style={styles.section}>Targets</Text>
        <View style={styles.card}>
          <Row icon="restaurant" label="Calories" value={`${t.target_calories || 0} kcal`} />
          <Row icon="egg" label="Protein" value={`${t.protein_g || 0} g`} />
          <Row icon="cafe" label="Carbs" value={`${t.carbs_g || 0} g`} />
          <Row icon="water" label="Fat" value={`${t.fat_g || 0} g`} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={override} onChangeText={setOverride} keyboardType="number-pad" placeholder="Override kcal" style={styles.input} testID="target-override" />
            <Pressable onPress={saveOverride} style={styles.saveBtn} testID="save-override-btn"><Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text></Pressable>
          </View>
        </View>

        <Text style={styles.section}>Diet & preferences</Text>
        <View style={styles.card}>
          <Row icon="earth" label="Background" value={p.faith || 'None'} />
          <Row icon="leaf" label="Diet type" value={(p.diet_type || 'omnivore').replace('_', ' ')} />
          {!!(p.protein_sources || []).length && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.proteinLbl}>Your protein sources</Text>
              <View style={styles.proteinWrap}>
                {(p.protein_sources || []).map((s: string) => (
                  <View key={s} style={styles.proteinChip}>
                    <Text style={styles.proteinChipTxt}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.section}>Settings</Text>
        <View style={styles.card}>
          <Pressable style={styles.rowP} onPress={toggleUnit} testID="toggle-unit-btn">
            <View style={styles.rowIcon}><Ionicons name="options" size={18} color={colors.brand} /></View>
            <Text style={styles.rowLbl}>Units</Text>
            <Text style={styles.rowVal}>{unit === 'imperial' ? 'lb / ft' : 'kg / cm'}</Text>
          </Pressable>
          <Pressable style={styles.rowP} onPress={() => router.push('/onboarding')} testID="edit-profile-btn">
            <View style={styles.rowIcon}><Ionicons name="create" size={18} color={colors.brand} /></View>
            <Text style={styles.rowLbl}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.rowP} onPress={() => router.push('/workout')} testID="workouts-btn">
            <View style={styles.rowIcon}><Ionicons name="barbell" size={18} color={colors.brand} /></View>
            <Text style={styles.rowLbl}>Workouts</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.rowP} onPress={() => router.push('/recipes')} testID="recipes-btn">
            <View style={styles.rowIcon}><Ionicons name="bookmark" size={18} color={colors.brand} /></View>
            <Text style={styles.rowLbl}>My Recipes</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.rowP} onPress={reset} testID="reset-btn">
            <View style={[styles.rowIcon, { backgroundColor: '#fee2e2' }]}><Ionicons name="refresh" size={18} color={colors.error} /></View>
            <Text style={[styles.rowLbl, { color: colors.error }]}>Reset & sign out</Text>
          </Pressable>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.rowP}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={colors.brand} /></View>
      <Text style={styles.rowLbl}>{label}</Text>
      <Text style={styles.rowVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  h1: { fontSize: 28, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.md, letterSpacing: -0.5 },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  rowP: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  rowLbl: { flex: 1, color: colors.onSurface, fontWeight: '700', fontSize: 15, textTransform: 'capitalize' },
  rowVal: { color: colors.muted, fontWeight: '700', fontSize: 14, textTransform: 'capitalize' },
  input: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 12, color: colors.onSurface },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  proteinLbl: { fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  proteinWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  proteinChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brandLight },
  proteinChipTxt: { color: colors.brandDark, fontWeight: '700', fontSize: 12 },
});
