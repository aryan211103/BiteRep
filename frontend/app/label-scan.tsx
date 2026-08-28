import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, shadow, mealOrder, mealLabel, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

export default function LabelScan() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const date = (params.date as string) || todayStr();

  const [uri, setUri] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [meal, setMeal] = useState<MealKey>((params.meal as MealKey) || 'lunch');

  const pick = async (from: 'camera' | 'library') => {
    let res;
    if (from === 'camera') {
      const p = await ImagePicker.getCameraPermissionsAsync();
      if (!p.granted) {
        if (!p.canAskAgain) { setPermDenied(true); return; }
        const req = await ImagePicker.requestCameraPermissionsAsync();
        if (!req.granted) { setPermDenied(!req.canAskAgain); return; }
      }
      setPermDenied(false);
      res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, allowsEditing: false });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    }
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUri(a.uri);
    setB64(a.base64 || null);
    setForm(null);
  };

  const analyze = async () => {
    if (!b64) return;
    setBusy(true);
    try {
      const j = await apiFetch('/ai/photo-label', { method: 'POST', body: JSON.stringify({ image_base64: b64 }) });
      setForm({
        name: j.name || '',
        brand: j.brand || '',
        serving_grams: String(Math.round(j.serving_grams || 100)),
        kcal_100g: String(Math.round(j.kcal_100g || 0)),
        protein_100g: String(Math.round(j.protein_100g || 0)),
        carbs_100g: String(Math.round(j.carbs_100g || 0)),
        fat_100g: String(Math.round(j.fat_100g || 0)),
      });
    } catch (e: any) {
      console.warn(e?.message);
      setForm({ name: '', brand: '', serving_grams: '100', kcal_100g: '0', protein_100g: '0', carbs_100g: '0', fat_100g: '0' });
    } finally { setBusy(false); }
  };

  const set = (k: string, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const preview = useMemo(() => {
    if (!form) return null;
    const g = Number(form.serving_grams) || 0;
    return {
      cal: Math.round((Number(form.kcal_100g) || 0) * g / 100),
      p: Math.round((Number(form.protein_100g) || 0) * g / 100),
      c: Math.round((Number(form.carbs_100g) || 0) * g / 100),
      f: Math.round((Number(form.fat_100g) || 0) * g / 100),
    };
  }, [form]);

  const save = async (alsoLog: boolean) => {
    if (!form || !form.name.trim() || saving) return;
    setSaving(true);
    try {
      await apiFetch('/saved-foods', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand.trim(),
          serving_grams: Number(form.serving_grams) || 100,
          kcal_100g: Number(form.kcal_100g) || 0,
          protein_100g: Number(form.protein_100g) || 0,
          carbs_100g: Number(form.carbs_100g) || 0,
          fat_100g: Number(form.fat_100g) || 0,
        }),
      });
      if (alsoLog && preview) {
        await apiFetch('/logs/food', {
          method: 'POST',
          body: JSON.stringify({
            date, meal,
            name: form.name.trim(),
            brand: form.brand.trim(),
            grams: Number(form.serving_grams) || 0,
            calories: preview.cal,
            protein_g: preview.p,
            carbs_g: preview.c,
            fat_g: preview.f,
            source: 'saved',
          }),
        });
        router.replace('/(tabs)/home');
      } else {
        router.back();
      }
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="ls-close">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Scan a label</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        {!uri && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={44} color={colors.brand} /></View>
            <Text style={styles.emptyH}>Photograph the label</Text>
            <Text style={styles.emptyP}>Capture the Nutrition Facts panel and the front of the package.</Text>
            {permDenied && (
              <View style={styles.permBox}>
                <Text style={styles.permTxt}>Camera access is off. Enable it in Settings.</Text>
                <Pressable onPress={() => Linking.openSettings()} style={styles.permBtn}>
                  <Text style={styles.permBtnTxt}>Open Settings</Text>
                </Pressable>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => pick('camera')} style={styles.cta} testID="ls-pick-camera">
                <Ionicons name="camera" size={18} color="#fff" />
                <Text style={styles.ctaTxt}>Camera</Text>
              </Pressable>
              <Pressable onPress={() => pick('library')} style={[styles.cta, { backgroundColor: colors.surfaceInverse }]} testID="ls-pick-library">
                <Ionicons name="images" size={18} color="#fff" />
                <Text style={styles.ctaTxt}>Library</Text>
              </Pressable>
            </View>
          </View>
        )}
        {uri && (
          <View>
            <Image source={{ uri }} style={styles.preview} />
            {!form && (
              <Pressable onPress={analyze} style={[styles.cta, { alignSelf: 'stretch', marginTop: 12 }]} disabled={busy} testID="ls-analyze-btn">
                {busy ? <ActivityIndicator color="#fff" /> : (<>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.ctaTxt}>Read label</Text>
                </>)}
              </Pressable>
            )}
            {form && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.section}>Confirm details</Text>
                <Field label="Name" value={form.name} onChangeText={(v) => set('name', v)} testID="ls-name" />
                <Field label="Brand" value={form.brand} onChangeText={(v) => set('brand', v)} testID="ls-brand" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="Serving (g)" value={form.serving_grams} onChangeText={(v) => set('serving_grams', v)} keyboardType="number-pad" testID="ls-serving" style={{ flex: 1 }} />
                  <Field label="kcal / 100g" value={form.kcal_100g} onChangeText={(v) => set('kcal_100g', v)} keyboardType="number-pad" testID="ls-kcal" style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field label="Protein/100g" value={form.protein_100g} onChangeText={(v) => set('protein_100g', v)} keyboardType="number-pad" testID="ls-protein" style={{ flex: 1 }} />
                  <Field label="Carbs/100g" value={form.carbs_100g} onChangeText={(v) => set('carbs_100g', v)} keyboardType="number-pad" testID="ls-carbs" style={{ flex: 1 }} />
                  <Field label="Fat/100g" value={form.fat_100g} onChangeText={(v) => set('fat_100g', v)} keyboardType="number-pad" testID="ls-fat" style={{ flex: 1 }} />
                </View>

                {preview && (
                  <View style={styles.totalRow} testID="ls-preview-kcal">
                    <Text style={styles.totalLbl}>Per serving</Text>
                    <Text style={styles.totalVal}>{preview.cal} kcal · P{preview.p} C{preview.c} F{preview.f}</Text>
                  </View>
                )}

                <Text style={styles.section}>Log to meal (optional)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {mealOrder.map((m) => (
                    <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mChip, meal === m && styles.mChipSel]} testID={`ls-meal-${m}`}>
                      <Text style={[styles.mChipT, meal === m && { color: '#fff' }]}>{mealLabel[m]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={() => save(true)} style={[styles.cta, { alignSelf: 'stretch', marginTop: 16 }, (!form.name.trim() || saving) && { opacity: 0.5 }]} disabled={!form.name.trim() || saving} testID="ls-save-log">
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Save & log to {mealLabel[meal]}</Text>}
                </Pressable>
                <Pressable onPress={() => save(false)} style={styles.secondaryBtn} disabled={!form.name.trim() || saving} testID="ls-save-only">
                  <Text style={styles.secondaryTxt}>Just save to my foods</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType, testID, style }: any) {
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.fieldInput} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.md, gap: 12, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyH: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  emptyP: { fontSize: 14, color: colors.muted, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  permBox: { marginTop: 16, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 12, alignItems: 'center' },
  permTxt: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  permBtn: { marginTop: 8, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  permBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cta: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  fieldLbl: { fontSize: 11, color: colors.muted, fontWeight: '700', marginBottom: 4 },
  fieldInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.brandLight, borderRadius: radius.lg, padding: 14, marginTop: 4 },
  totalLbl: { fontSize: 13, fontWeight: '700', color: colors.brandDark, textTransform: 'uppercase' },
  totalVal: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
  mChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mChipT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  secondaryBtn: { alignSelf: 'stretch', marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  secondaryTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
