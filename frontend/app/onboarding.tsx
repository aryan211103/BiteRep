import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { inToCm, cmToIn, lbsToKg, kgToLbs } from '@/src/units';

const STEPS = ['welcome', 'name', 'sex', 'age', 'measurements', 'activity', 'goal', 'faith', 'diet_type', 'diet_detail', 'summary'] as const;
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

const FAITHS = ['None', 'Hindu', 'Muslim', 'Jain', 'Christian', 'Jewish', 'Buddhist', 'Sikh'];

const DIET_TYPES: { key: string; label: string; sub: string }[] = [
  { key: 'omnivore', label: 'Omnivore', sub: 'Eats everything' },
  { key: 'eggetarian', label: 'Eggetarian', sub: 'Vegetarian + eggs' },
  { key: 'vegetarian', label: 'Vegetarian', sub: 'No meat, fish or eggs' },
  { key: 'vegan', label: 'Vegan', sub: 'No animal products at all' },
  { key: 'pescatarian', label: 'Pescatarian', sub: 'Vegetarian + fish & seafood' },
];

const DIET_ITEMS = ['beef', 'pork', 'chicken', 'mutton', 'seafood', 'eggs', 'dairy', 'root_veg', 'onion_garlic'];
const DIET_LABELS: Record<string, string> = {
  beef: 'Beef',
  pork: 'Pork',
  chicken: 'Chicken',
  mutton: 'Mutton & lamb',
  seafood: 'Fish & seafood',
  eggs: 'Eggs',
  dairy: 'Dairy',
  root_veg: 'Root vegetables',
  onion_garlic: 'Onion & garlic',
};

// Base defaults by diet type — these only SEED sensible starting toggles; the user can flip anything.
const dietDefaultsForType = (t: string): Record<string, boolean> => {
  const d: Record<string, boolean> = Object.fromEntries(DIET_ITEMS.map((k) => [k, true]));
  if (t === 'vegetarian' || t === 'vegan') {
    d.beef = d.pork = d.chicken = d.mutton = d.seafood = d.eggs = false;
    if (t === 'vegan') d.dairy = false;
  } else if (t === 'eggetarian') {
    d.beef = d.pork = d.chicken = d.mutton = d.seafood = false;
    d.eggs = true;
  } else if (t === 'pescatarian') {
    d.beef = d.pork = d.chicken = d.mutton = false;
    d.seafood = true; d.eggs = true; d.dairy = true;
  }
  return d;
};

// Faith seeds additional sensible defaults on top of the diet-type baseline.
const applyFaithOverrides = (faith: string, d: Record<string, boolean>): Record<string, boolean> => {
  const out = { ...d };
  if (faith === 'Hindu') out.beef = false;
  if (faith === 'Muslim') out.pork = false;
  if (faith === 'Jewish') out.pork = false;
  if (faith === 'Sikh') out.beef = false;
  if (faith === 'Buddhist') { out.beef = out.pork = out.chicken = out.mutton = out.seafood = false; }
  if (faith === 'Jain') {
    out.beef = out.pork = out.chicken = out.mutton = out.seafood = out.eggs = false;
    out.root_veg = false; out.onion_garlic = false;
  }
  return out;
};

const computeDietDefaults = (faith: string, dietType: string) => applyFaithOverrides(faith, dietDefaultsForType(dietType));

const PROTEIN_LABELS: Record<string, string> = {
  chicken: 'Chicken', mutton: 'Mutton & lamb', seafood: 'Fish & seafood',
  beef: 'Beef', pork: 'Pork', eggs: 'Eggs', dairy: 'Paneer & dairy',
};
const PLANT_PROTEINS = ['Lentils (dal)', 'Chickpeas', 'Beans', 'Tofu', 'Soy', 'Peanuts'];
const proteinSources = (d: Record<string, boolean>): string[] => {
  const list: string[] = [];
  (['chicken', 'mutton', 'seafood', 'eggs', 'dairy', 'beef', 'pork'] as const).forEach((k) => {
    if (d[k]) list.push(PROTEIN_LABELS[k]);
  });
  return [...list, ...PLANT_PROTEINS];
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
  const [dietType, setDietType] = useState('omnivore');
  const [diet, setDiet] = useState<Record<string, boolean>>(computeDietDefaults('None', 'omnivore'));
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
          diet_type: dietType,
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
          {step === 'faith' && (
            <View>
              <Text style={styles.h1}>Your background</Text>
              <Text style={styles.p}>This just helps us seed sensible defaults for what you eat — you can change anything after.</Text>
              <View style={styles.cardGrid}>
                {FAITHS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => {
                      setFaith(f);
                      const dt = f === 'Jain' ? 'vegetarian' : dietType;
                      if (f === 'Jain') setDietType(dt);
                      setDiet(computeDietDefaults(f, dt));
                    }}
                    style={[styles.gridCard, faith === f && styles.gridCardSel]}
                    testID={`onb-faith-${f}`}
                  >
                    <Text style={[styles.gridCardTxt, faith === f && { color: '#fff' }]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {step === 'diet_type' && (
            <View>
              <Text style={styles.h1}>How do you eat?</Text>
              <Text style={styles.p}>Pick the closest match, then fine-tune the details next.</Text>
              {DIET_TYPES.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => { setDietType(d.key); setDiet(computeDietDefaults(faith, d.key)); }}
                  style={[styles.optionCard, dietType === d.key && styles.optionCardSel]}
                  testID={`onb-diettype-${d.key}`}
                >
                  <Text style={[styles.optTitle, dietType === d.key && { color: '#fff' }]}>{d.label}</Text>
                  <Text style={[styles.optSub, dietType === d.key && { color: '#dcfce7' }]}>{d.sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {step === 'diet_detail' && (
            <View>
              <Text style={styles.h1}>What do you actually eat?</Text>
              <Text style={styles.p}>We seeded these from your picks, but toggle anything on or off — this is about fitting BiteRep to how you already eat, not judging it.</Text>
              <View style={{ gap: 8 }}>
                {DIET_ITEMS.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setDiet({ ...diet, [k]: !diet[k] })}
                    style={styles.dietRow}
                    testID={`onb-diet-${k}`}
                  >
                    <Text style={styles.dietLbl}>{DIET_LABELS[k]}</Text>
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

              <Text style={styles.proteinHeading}>Your protein sources</Text>
              <Text style={styles.p}>Based on what you eat — swap anything anytime in Profile.</Text>
              <View style={styles.proteinWrap}>
                {proteinSources(diet).map((s) => (
                  <View key={s} style={styles.proteinChip}>
                    <Text style={styles.proteinChipTxt}>{s}</Text>
                  </View>
                ))}
              </View>
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
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  gridCard: { width: '47%', paddingVertical: 20, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  gridCardSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  gridCardTxt: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  proteinHeading: { fontSize: 18, fontWeight: '800', color: colors.onSurface, marginTop: 24 },
  proteinWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  proteinChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.brandLight },
  proteinChipTxt: { color: colors.brandDark, fontWeight: '700', fontSize: 13 },
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
