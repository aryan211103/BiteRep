import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr, kgToLbs, lbsToKg } from '@/src/units';
import Svg, { Polyline, Circle, Line, Text as SText } from 'react-native-svg';

export default function Trends() {
  const [weights, setWeights] = useState<any[]>([]);
  const [adaptive, setAdaptive] = useState<any>(null);
  const [wInput, setWInput] = useState('');
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');

  const load = async () => {
    try {
      const [w, a, me] = await Promise.all([
        apiFetch('/logs/weight'),
        apiFetch('/trends/adaptive-tdee'),
        apiFetch('/me'),
      ]);
      setWeights(w.logs);
      setAdaptive(a);
      setUnit(me?.profile?.unit_system || 'imperial');
    } catch (e: any) { console.warn(e?.message); }
  };

  useEffect(() => { load(); }, []);

  const logWeight = async () => {
    if (!wInput.trim()) return;
    const val = Number(wInput);
    const kg = unit === 'imperial' ? lbsToKg(val) : val;
    try {
      await apiFetch('/logs/weight', { method: 'POST', body: JSON.stringify({ date: todayStr(), weight_kg: kg }) });
      setWInput(''); load();
    } catch (e: any) { console.warn(e?.message); }
  };

  // build chart data
  const pts = weights.slice(-30);
  const w = 320, h = 160, pad = 24;
  let path = '';
  if (pts.length >= 1) {
    const vals = pts.map((p) => p.weight_kg);
    const min = Math.min(...vals) - 0.5;
    const max = Math.max(...vals) + 0.5;
    const step = (w - pad * 2) / Math.max(pts.length - 1, 1);
    path = pts.map((p, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (p.weight_kg - min) / (max - min || 1));
      return `${x},${y}`;
    }).join(' ');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Trends</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Adaptive TDEE</Text>
          {adaptive?.adaptive_tdee ? (
            <>
              <Text style={styles.bigNum} testID="adaptive-tdee">{adaptive.adaptive_tdee} kcal</Text>
              <Text style={styles.sub}>{adaptive.days} days · avg intake {adaptive.avg_intake} kcal · Δ {adaptive.delta_kg} kg</Text>
            </>
          ) : (
            <Text style={styles.sub}>{adaptive?.reason || 'Log weight and food regularly to learn your true maintenance.'}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weight trend</Text>
          <Svg width={w} height={h}>
            {pts.length > 1 && (
              <Polyline points={path} fill="none" stroke={colors.brand} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {pts.map((p, i) => {
              const vals = pts.map((x) => x.weight_kg);
              const min = Math.min(...vals) - 0.5;
              const max = Math.max(...vals) + 0.5;
              const step = (w - pad * 2) / Math.max(pts.length - 1, 1);
              const x = pad + i * step;
              const y = pad + (h - pad * 2) * (1 - (p.weight_kg - min) / (max - min || 1));
              return <Circle key={i} cx={x} cy={y} r={3} fill={colors.brand} />;
            })}
          </Svg>
          {pts.length === 0 && <Text style={styles.sub}>No entries yet.</Text>}

          <View style={styles.inputRow}>
            <TextInput
              value={wInput}
              onChangeText={setWInput}
              placeholder={`Today's weight (${unit === 'imperial' ? 'lb' : 'kg'})`}
              keyboardType="decimal-pad"
              style={styles.input}
              testID="weight-input"
            />
            <Pressable onPress={logWeight} style={styles.logBtn} testID="log-weight-btn">
              <Text style={{ color: '#fff', fontWeight: '800' }}>Log</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  h1: { fontSize: 28, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.md, letterSpacing: -0.5 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card, marginBottom: spacing.md },
  cardTitle: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  bigNum: { fontSize: 34, fontWeight: '800', color: colors.brand, letterSpacing: -1 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  inputRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  input: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 12, color: colors.onSurface },
  logBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
