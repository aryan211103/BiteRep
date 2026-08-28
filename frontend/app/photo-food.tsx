import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, shadow, mealOrder, mealLabel, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

export default function PhotoFood() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const date = (params.date as string) || todayStr();

  const [uri, setUri] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [meal, setMeal] = useState<MealKey>((params.meal as MealKey) || 'lunch');
  const [permDenied, setPermDenied] = useState(false);

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
      res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: false });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    }
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUri(a.uri);
    setB64(a.base64 || null);
    setItems(null);
  };

  const analyze = async () => {
    if (!b64) return;
    setBusy(true);
    try {
      const j = await apiFetch('/ai/photo-food', { method: 'POST', body: JSON.stringify({ image_base64: b64 }) });
      setItems((j.items || []).map((it: any) => ({ ...it, grams: String(Math.round(it.grams || 100)) })));
    } catch (e: any) {
      console.warn(e?.message);
      setItems([]);
    } finally { setBusy(false); }
  };

  const updateGrams = (i: number, delta: number) => {
    setItems((prev) => (prev || []).map((it, idx) => {
      if (idx !== i) return it;
      const g = Math.max(0, (Number(it.grams) || 0) + delta);
      return { ...it, grams: String(g) };
    }));
  };
  const setGrams = (i: number, v: string) => {
    setItems((prev) => (prev || []).map((it, idx) => (idx === i ? { ...it, grams: v } : it)));
  };

  const computed = useMemo(() => {
    if (!items) return [];
    return items.map((it) => {
      const g = Number(it.grams) || 0;
      return {
        cal: Math.round((it.kcal_100g || 0) * g / 100),
        p: Math.round((it.protein_100g || 0) * g / 100),
        c: Math.round((it.carbs_100g || 0) * g / 100),
        f: Math.round((it.fat_100g || 0) * g / 100),
      };
    });
  }, [items]);

  const totalCal = computed.reduce((s, c) => s + c.cal, 0);

  const logAll = async () => {
    if (!items || items.length === 0 || saving) return;
    setSaving(true);
    try {
      let photoPath: string | undefined;
      if (b64) {
        try {
          const up = await apiFetch('/uploads/photo', { method: 'POST', body: JSON.stringify({ image_base64: b64, content_type: 'image/jpeg' }) });
          photoPath = up.path;
        } catch (e) { console.warn('photo upload failed', e); }
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const c = computed[i];
        await apiFetch('/logs/food', {
          method: 'POST',
          body: JSON.stringify({
            date, meal,
            name: it.name,
            brand: it.brand || '',
            grams: Number(it.grams) || 0,
            calories: c.cal,
            protein_g: c.p,
            carbs_g: c.c,
            fat_g: c.f,
            source: it.matched ? 'openfoodfacts' : 'ai',
            off_code: it.off_code || null,
            photo_path: photoPath || null,
          }),
        });
      }
      router.replace('/(tabs)/home');
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="pf-close">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>AI Photo Log</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        {!uri && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="camera-outline" size={44} color={colors.brand} /></View>
            <Text style={styles.emptyH}>Snap your meal</Text>
            <Text style={styles.emptyP}>We identify each item, estimate calories & macros, and match verified data where we can.</Text>
            {permDenied && (
              <View style={styles.permBox}>
                <Text style={styles.permTxt}>Camera access is off. Enable it in Settings to snap meal photos.</Text>
                <Pressable onPress={() => Linking.openSettings()} style={styles.permBtn}>
                  <Text style={styles.permBtnTxt}>Open Settings</Text>
                </Pressable>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => pick('camera')} style={styles.cta} testID="pick-camera">
                <Ionicons name="camera" size={18} color="#fff" />
                <Text style={styles.ctaTxt}>Camera</Text>
              </Pressable>
              <Pressable onPress={() => pick('library')} style={[styles.cta, { backgroundColor: colors.surfaceInverse }]} testID="pick-library">
                <Ionicons name="images" size={18} color="#fff" />
                <Text style={styles.ctaTxt}>Library</Text>
              </Pressable>
            </View>
          </View>
        )}
        {uri && (
          <View>
            <Image source={{ uri }} style={styles.preview} />
            {!items && (
              <Pressable onPress={analyze} style={[styles.cta, { alignSelf: 'stretch', marginTop: 12 }]} disabled={busy} testID="analyze-btn">
                {busy ? <ActivityIndicator color="#fff" /> : (<>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.ctaTxt}>Analyze</Text>
                </>)}
              </Pressable>
            )}
            {items && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.section}>Detected items</Text>
                {items.length === 0 && <Text style={{ color: colors.muted }}>No items detected. Try a clearer photo.</Text>}
                {items.map((it, i) => {
                  const c = computed[i];
                  return (
                    <View key={i} style={styles.itemCard} testID={`ai-item-${i}`}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                        <View style={[styles.badge, it.matched ? styles.badgeDb : styles.badgeAi]}>
                          <Text style={[styles.badgeTxt, it.matched ? styles.badgeTxtDb : styles.badgeTxtAi]}>
                            {it.matched ? 'From database' : 'AI estimate'}
                          </Text>
                        </View>
                      </View>
                      {!!it.brand && <Text style={styles.itemBrand}>{it.brand}</Text>}
                      <View style={styles.gramsRow}>
                        <Pressable onPress={() => updateGrams(i, -10)} style={styles.stepBtn} testID={`ai-grams-minus-${i}`}>
                          <Ionicons name="remove" size={16} color={colors.onSurface} />
                        </Pressable>
                        <TextInput
                          value={String(it.grams)}
                          onChangeText={(v) => setGrams(i, v)}
                          keyboardType="number-pad"
                          style={styles.gramsInput}
                          testID={`ai-grams-input-${i}`}
                        />
                        <Text style={styles.gramsUnit}>g</Text>
                        <Pressable onPress={() => updateGrams(i, 10)} style={styles.stepBtn} testID={`ai-grams-plus-${i}`}>
                          <Ionicons name="add" size={16} color={colors.onSurface} />
                        </Pressable>
                        <Text style={styles.itemKcal}>{c.cal} kcal</Text>
                      </View>
                      <Text style={styles.itemSub}>P {c.p}g · C {c.c}g · F {c.f}g</Text>
                    </View>
                  );
                })}

                {items.length > 0 && (
                  <View style={styles.totalRow} testID="ai-total-kcal">
                    <Text style={styles.totalLbl}>Total</Text>
                    <Text style={styles.totalVal}>{totalCal} kcal</Text>
                  </View>
                )}

                <Text style={styles.section}>Meal</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {mealOrder.map((m) => (
                    <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mChip, meal === m && styles.mChipSel]} testID={`pf-meal-${m}`}>
                      <Text style={[styles.mChipT, meal === m && { color: '#fff' }]}>{mealLabel[m]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={logAll} style={[styles.cta, { alignSelf: 'stretch', marginTop: 16 }, (items.length === 0 || saving) && { opacity: 0.5 }]} disabled={items.length === 0 || saving} testID="pf-log-all">
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.ctaTxt}>Log {items.length} item{items.length === 1 ? '' : 's'} to {mealLabel[meal]}</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  itemCard: { backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: radius.lg, ...shadow.card, marginBottom: 8 },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.onSurface, flexShrink: 1, marginRight: 8 },
  itemBrand: { fontSize: 12, color: colors.muted, marginTop: 2 },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  itemKcal: { fontSize: 15, fontWeight: '800', color: colors.brand, marginLeft: 'auto' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeDb: { backgroundColor: colors.brandLight },
  badgeAi: { backgroundColor: '#fef3c7' },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  badgeTxtDb: { color: colors.brandDark },
  badgeTxtAi: { color: '#92400e' },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  gramsInput: { width: 52, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: 8, paddingVertical: 4 },
  gramsUnit: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.brandLight, borderRadius: radius.lg, padding: 14, marginTop: 4 },
  totalLbl: { fontSize: 13, fontWeight: '700', color: colors.brandDark, textTransform: 'uppercase' },
  totalVal: { fontSize: 18, fontWeight: '800', color: colors.brandDark },
  mChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mChipT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
});
