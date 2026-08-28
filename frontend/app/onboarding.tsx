import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { inToCm, cmToIn, lbsToKg, kgToLbs } from '@/src/units';

const STEPS = ['welcome', 'name', 'sex', 'age', 'measurements', 'activity', 'goal', 'diet', 'summary'] as const;
type Step = typeof STEPS[number];

const ACTIVITIES: { key: string; label: string; sub: string }[] = [
  { key: 'sedentary', label: 'Sedentary', sub: 'Little/no exercise' },
  { key: 'light', label: 'Lightly active', sub: '1–3 days/week' },
  { key: 'moderate', label: 'Moderately active', sub: '3–5 days/week' },
  { key: 'active', label: 'Very active', sub: '6–7 days/week' },
  { key: 'athlete', label: 'Athlete', sub: '2x/day training' },
];

const GOALS: { key: string; label: string; sub: string }[] = [
  { key: 'lose_fat', label: 'Lose fat', sub: 'Slight calorie deficit' },
  { key: 'maintain', label: 'Maintain', sub: 'Hold current weight' },
  { key: 'build_muscle', label: 'Build muscle', sub: 'Slight surplus' },
];

const FAITHS = ['None', 'Hindu', 'Muslim', 'Jain', 'Christian', 'Jewish', 'Buddhist', 'Other'];
const DIET_ITEMS = ['beef', 'pork', 'chicken', 'mutton', 'seafood', 'eggs', 'dairy', 'onion_garlic', 'root_veg'];

const defaultDietForFaith = (f: string) => {
  const d: Record<string, boolean> = Object.fromEntries(DIET_ITEMS.map((k) => [k, true]));
  if (f === 'Hindu') d.beef = false;
  if (f === 'Muslim') d.pork = false;
  if (f === 'Jain') { d.beef = d.pork = d.chicken = d.mutton = d.seafood = d.eggs = d.onion_garlic = d.root_veg = false; }
  if (f === 'Jewish') d.pork = false;
  if (f === 'Buddhist') { d.beef = d.pork = d.chicken = d.mutton = d.seafood = false; }
  return d;
};

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState('30');
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('9');
  const [heightCm, setHeightCm] = useState('175');
  const [weightLb, setWeightLb] = useState('160');
  const [weightKg, setWeightKg] = useState('72');
  const [activity, setActivity] = useState('moderate');
  const [goal, setGoal] = useState('maintain');
  const [faith, setFaith] = useState('None');
  const [diet, setDiet] = useState<Record<string, boolean>>(defaultDietForFaith('None'));
  const [busy, setBusy] = useState(false);

  const idx = STEPS.indexOf(step);
  const canNext = useMemo(() => {
    if (step === 'name') return name.trim().length > 0;
    if (step === 'age') return Number(age) >= 12 && Number(age) <= 100;
    return true;
  }, [step, name, age]);

  const next = () => {
    if (step === 'summary') return submit();
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  };
  const back = () => {
    if (idx === 0) return;
    setStep(STEPS[idx - 1]);
  };

  const computeCmKg = () => {
    const cm = unit === 'imperial' ? inToCm(Number(heightFt) * 12 + Number(heightIn)) : Number(heightCm);
    const kg = unit === 'imperial' ? lbsToKg(Number(weightLb)) : Number(weightKg);
    return { cm, kg };
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { cm, kg } = computeCmKg();
      await apiFetch('/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || 'friend',
          sex,
          age: Number(age),
          height_cm: cm,
          weight_kg: kg,
          activity,
          goal,
          unit_system: unit,
          faith,
          diet_flags: diet,
        }),
      });
      router.replace('/(tabs)/home');
    } catch (e: any) {
      console.warn('onboard fail', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => {
    const { cm, kg } = computeCmKg();
    const bmr = 10 * kg + 6.25 * cm - 5 * Number(age) + (sex === 'male' ? 5 : -161);
    const factor = { sedentary: 1.2, light: 1.375, moderate: 1.48, active: 1.6, athlete: 1.75 }[activity] || 1.48;
    const maint = bmr * factor;
    const ratePct = goal === 'lose_fat' ? 0.5 : goal === 'build_muscle' ? 0.25 : 0;
    const adj = (ratePct / 100 * kg * 7700) / 7;
    const target = goal === 'lose_fat' ? maint - adj : goal === 'build_muscle' ? maint + adj : maint;
    const p = kg * (goal === 'lose_fat' ? 2.2 : 2.0);
    const f = (target * 0.25) / 9;
    const c = (target - p * 4 - f * 9) / 4;
    return {
      bmr: Math.round(bmr), maint: Math.round(maint), adj: Math.round(adj),
      target: Math.round(target), p: Math.round(p), f: Math.round(f), c: Math.round(Math.max(c, 0)),
    };
  }, [heightFt, heightIn, heightCm, weightLb, weightKg, age, sex, activity, goal, unit]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          {idx > 0 && (
            <Pressable onPress={back} style={styles.backBtn} testID="onb-back">
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          )}
          <View style={styles.progressBg}>
            <View style={[styles.progressBar, { width: `${((idx + 1) / STEPS.length) * 100}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {step === 'welcome' && (
            <View>
              <Text style={styles.h1}>Welcome to BiteRep</Text>
              <Text style={styles.p}>Free, transparent calorie tracking. Let's set up your plan in under a minute.</Text>
            </View>
          )}
          {step === 'name' && (
            <View>
              <Text style={styles.h1}>What should we call you?</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Your name" style={styles.input} testID="onb-name" />
            </View>
          )}
          {step === 'sex' && (
            <View>
              <Text style={styles.h1}>Biological sex</Text>
              <Text style={styles.p}>Used for BMR calculation.</Text>
              <View style={styles.rowGap}>
                {(['male', 'female'] as const).map((s) => (
                  <Pressable key={s} onPress={() => setSex(s)} style={[styles.pill, sex === s && styles.pillSel]} testID={`onb-sex-${s}`}>
                    <Text style={[styles.pillTxt, sex === s && styles.pillTxtSel]}>{s === 'male' ? 'Male' : 'Female'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {step === 'age' && (
            <View>
              <Text style={styles.h1}>How old are you?</Text>
              <TextInput value={age} onChangeText={setAge} keyboardType="number-pad" style={styles.input} testID="onb-age" />
            </View>
          )}
          {step === 'measurements' && (
            <View>
              <Text style={styles.h1}>Your measurements</Text>
              <View style={styles.unitToggle}>
                {(['imperial', 'metric'] as const).map((u) => (
                  <Pressable key={u} onPress={() => setUnit(u)} style={[styles.unitBtn, unit === u && styles.unitBtnSel]} testID={`onb-unit-${u}`}>
                    <Text style={[styles.unitTxt, unit === u && styles.unitTxtSel]}>{u === 'imperial' ? 'lb / ft' : 'kg / cm'}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.lbl}>Height</Text>
              {unit === 'imperial' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={heightFt} onChangeText={setHeightFt} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholder="ft" testID="onb-height-ft" />
                  <TextInput value={heightIn} onChangeText={setHeightIn} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholder="in" testID="onb-height-in" />
                </View>
              ) : (
                <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="number-pad" style={styles.input} placeholder="cm" testID="onb-height-cm" />
              )}
              <Text style={styles.lbl}>Weight</Text>
              {unit === 'imperial' ? (
                <TextInput value={weightLb} onChangeText={setWeightLb} keyboardType="decimal-pad" style={styles.input} placeholder="lb" testID="onb-weight-lb" />
              ) : (
                <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" style={styles.input} placeholder="kg" testID="onb-weight-kg" />
              )}
            </View>
          )}
          {step === 'activity' && (
            <View>
              <Text style={styles.h1}>Activity level</Text>
              {ACTIVITIES.map((a) => (
                <Pressable key={a.key} onPress={() => setActivity(a.key)} style={[styles.optionCard, activity === a.key && styles.optionCardSel]} testID={`onb-act-${a.key}`}>
                  <Text style={[styles.optTitle, activity === a.key && { color: '#fff' }]}>{a.label}</Text>
                  <Text style={[styles.optSub, activity === a.key && { color: '#dcfce7' }]}>{a.sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {step === 'goal' && (
            <View>
              <Text style={styles.h1}>Your goal</Text>
              {GOALS.map((g) => (
                <Pressable key={g.key} onPress={() => setGoal(g.key)} style={[styles.optionCard, goal === g.key && styles.optionCardSel]} testID={`onb-goal-${g.key}`}>
                  <Text style={[styles.optTitle, goal === g.key && { color: '#fff' }]}>{g.label}</Text>
                  <Text style={[styles.optSub, goal === g.key && { color: '#dcfce7' }]}>{g.sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {step === 'diet' && (
            <View>
              <Text style={styles.h1}>Dietary preferences</Text>
              <Text style={styles.p}>Pick your faith to seed defaults, then adjust. We'll respect these in food search and coaching.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                {FAITHS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => { setFaith(f); setDiet(defaultDietForFaith(f)); }}
                    style={[styles.chip, faith === f && styles.chipSel]}
                    testID={`onb-faith-${f}`}
                  >
                    <Text style={[styles.chipTxt, faith === f && styles.chipTxtSel]}>{f}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ marginTop: spacing.md, gap: 8 }}>
                {DIET_ITEMS.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setDiet({ ...diet, [k]: !diet[k] })}
                    style={styles.dietRow}
                    testID={`onb-diet-${k}`}
                  >
                    <Text style={styles.dietLbl}>{k.replace('_', ' ')}</Text>
                    <View style={[styles.toggle, diet[k] && styles.toggleOn]}>
                      <View style={[styles.toggleKnob, diet[k] && { left: 20 }]} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {step === 'summary' && (
            <View>
              <Text style={styles.h1}>Your daily plan</Text>
              <View style={styles.summaryCard}>
                <SummaryRow label="BMR" value={`${preview.bmr} kcal`} />
                <SummaryRow label="× activity" value={`${preview.maint} kcal maintenance`} />
                <SummaryRow label={goal === 'maintain' ? 'No adjustment' : goal === 'lose_fat' ? '− deficit' : '+ surplus'} value={goal === 'maintain' ? '0 kcal/day' : `${preview.adj} kcal/day`} />
                <View style={styles.divider} />
                <View style={styles.targetRow}>
                  <Text style={styles.targetLbl}>Daily target</Text>
                  <Text style={styles.targetVal} testID="onb-target">{preview.target} kcal</Text>
                </View>
                <View style={styles.macroRow}>
                  <MacroPill label="P" v={preview.p} color="#16a34a" />
                  <MacroPill label="C" v={preview.c} color="#eab308" />
                  <MacroPill label="F" v={preview.f} color="#f97316" />
                </View>
              </View>
              <Text style={styles.finePrint}>You can override this target anytime in Profile.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, (!canNext || busy) && { opacity: 0.5 }]}
            onPress={next}
            disabled={!canNext || busy}
            testID="onb-next"
          >
            <Text style={styles.ctaTxt}>{step === 'summary' ? (busy ? 'Saving…' : 'Start tracking') : 'Continue'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: colors.muted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
function MacroPill({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 14, marginRight: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{v}g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  progressBg: { flex: 1, height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: colors.brand, borderRadius: 3 },
  body: { padding: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing['3xl'] },
  h1: { fontSize: 28, fontWeight: '800', color: colors.onSurface, marginBottom: 8, letterSpacing: -0.5 },
  p: { fontSize: 15, color: colors.muted, marginBottom: 20, lineHeight: 22 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: 16, fontSize: 18, borderWidth: 1, borderColor: colors.border, marginTop: 4, marginBottom: 8, color: colors.onSurface },
  lbl: { fontSize: 13, color: colors.muted, fontWeight: '700', marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowGap: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pillSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillTxt: { fontSize: 16, color: colors.onSurface, fontWeight: '700' },
  pillTxtSel: { color: '#FFFFFF' },
  optionCard: { backgroundColor: colors.surfaceSecondary, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  optionCardSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  optTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface },
  optSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  unitToggle: { flexDirection: 'row', backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4, marginBottom: 12, alignSelf: 'flex-start' },
  unitBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.pill },
  unitBtnSel: { backgroundColor: colors.surfaceSecondary, ...shadow.card },
  unitTxt: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  unitTxtSel: { color: colors.onSurface },
  chip: { paddingHorizontal: 16, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.onSurface, fontWeight: '700', fontSize: 13 },
  chipTxtSel: { color: '#FFFFFF' },
  dietRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  dietLbl: { fontSize: 15, color: colors.onSurface, fontWeight: '600', textTransform: 'capitalize' },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: colors.borderStrong, padding: 2 },
  toggleOn: { backgroundColor: colors.brand },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', left: 0, position: 'relative' },
  summaryCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  targetLbl: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  targetVal: { fontSize: 30, fontWeight: '800', color: colors.brand },
  macroRow: { flexDirection: 'row', marginTop: 14 },
  finePrint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12 },
  footer: { padding: spacing.lg, paddingBottom: spacing.md },
  cta: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', ...shadow.cardStrong },
  ctaTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
