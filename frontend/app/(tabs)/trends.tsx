import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr, kgToLbs, lbsToKg } from '@/src/units';
import Svg, { Polyline, Circle, Line, Text as SText } from 'react-native-svg';

export default function Trends() {
  const [weights, setWeights] = useState<any[]>([]);
  const [adaptive, setAdaptive] = useState<any>(null);
  const [recap, setRecap] = useState<any>(null);
  const [wInput, setWInput] = useState('');
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');

  const load = async () => {
    try {
      const [w, a, me, r] = await Promise.all([
        apiFetch('/logs/weight'),
        apiFetch('/trends/adaptive-tdee'),
        apiFetch('/me'),
        apiFetch('/trends/weekly-recap'),
      ]);
      setWeights(w.logs);
      setAdaptive(a);
      setUnit(me?.profile?.unit_system || 'imperial');
      setRecap(r);
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
          <Text style={styles.cardTitle}>This week</Text>
          {recap && recap.logged_days > 0 ? (
            <>
              <View style={styles.recapRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recapBig}>{recap.avg_calories}</Text>
                  <Text style={styles.sub}>avg kcal/day vs {recap.target_calories} target</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recapBig, { color: recap.adherence_pct >= 80 ? colors.brand : colors.warning }]}>{recap.adherence_pct}%</Text>
                  <Text style={styles.sub}>adherence</Text>
                </View>
              </View>
              <View style={styles.miniBars}>
                {recap.days.map((d: any) => {
                  const pct = recap.target_calories > 0 ? Math.min(d.calories / recap.target_calories, 1.3) : 0;
                  const dt = new Date(d.date + 'T00:00:00');
                  return (
                    <View key={d.date} style={styles.miniBarCol}>
                      <View style={styles.miniBarTrack}>
                        <View style={[styles.miniBarFill, { height: `${Math.min(pct, 1) * 100}%`, backgroundColor: pct > 1 ? colors.warning : colors.brand }]} />
                      </View>
                      <Text style={styles.miniBarLbl}>{dt.toLocaleDateString('en-US', { weekday: 'short' })[0]}</Text>
                    </View>
                  );
                })}
              </View>
              {recap.top_protein_day && (
                <View style={styles.recapNoteRow}>
                  <Ionicons name="trophy-outline" size={14} color={colors.brand} />
                  <Text style={styles.recapNote}>
                    Best protein day: {new Date(recap.top_protein_day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })} · {recap.top_protein_day.protein_g}g protein
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.sub}>Log meals this week to see your recap here.</Text>
          )}
        </View>

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
  recapRow: { flexDirection: 'row', marginTop: 4 },
  recapBig: { fontSize: 26, fontWeight: '800', color: colors.brand, letterSpacing: -0.5 },
  miniBars: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, height: 60 },
  miniBarCol: { alignItems: 'center', flex: 1, gap: 6 },
  miniBarTrack: { width: 14, height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
  miniBarFill: { width: '100%', borderRadius: 7 },
  miniBarLbl: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  recapNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: colors.brandLight, padding: 10, borderRadius: radius.md },
  recapNote: { fontSize: 12, color: colors.brandDark, fontWeight: '700', flex: 1 },
});
