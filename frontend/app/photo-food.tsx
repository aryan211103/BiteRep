import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, shadow, mealOrder, mealLabel, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

export default function PhotoFood() {
  const router = useRouter();
  const [uri, setUri] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [meal, setMeal] = useState<MealKey>('lunch');

  const pick = async (from: 'camera' | 'library') => {
    let res;
    if (from === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return;
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
      setItems(j.items || []);
    } catch (e: any) {
      console.warn(e?.message);
      setItems([]);
    } finally { setBusy(false); }
  };

  const logAll = async () => {
    if (!items) return;
    try {
      for (const it of items) {
        const g = Number(it.grams) || 100;
        const cal = Math.round((it.kcal_100g || 0) * g / 100);
        await apiFetch('/logs/food', {
          method: 'POST',
          body: JSON.stringify({
            date: todayStr(), meal,
            name: it.name,
            brand: 'AI estimate',
            grams: g,
            calories: cal,
            protein_g: Math.round((it.protein_100g || 0) * g / 100),
            carbs_g: Math.round((it.carbs_100g || 0) * g / 100),
            fat_g: Math.round((it.fat_100g || 0) * g / 100),
            source: 'ai',
          }),
        });
      }
      router.replace('/(tabs)/home');
    } catch (e) { console.warn(e); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="pf-close">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>AI Photo Log</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {!uri && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="camera-outline" size={44} color={colors.brand} /></View>
            <Text style={styles.emptyH}>Snap your meal</Text>
            <Text style={styles.emptyP}>We'll identify each item and estimate calories & macros.</Text>
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
                {items.length === 0 && <Text style={{ color: colors.muted }}>No items detected.</Text>}
                {items.map((it, i) => {
                  const g = Number(it.grams) || 100;
                  const cal = Math.round((it.kcal_100g || 0) * g / 100);
                  return (
                    <View key={i} style={styles.itemCard} testID={`ai-item-${i}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{it.name}</Text>
                        <Text style={styles.itemSub}>{g} g · P {Math.round((it.protein_100g||0)*g/100)}g · C {Math.round((it.carbs_100g||0)*g/100)}g · F {Math.round((it.fat_100g||0)*g/100)}g</Text>
                        <View style={styles.badge}><Text style={styles.badgeTxt}>AI estimate</Text></View>
                      </View>
                      <Text style={styles.itemKcal}>{cal} kcal</Text>
                    </View>
                  );
                })}

                <Text style={styles.section}>Meal</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {mealOrder.map((m) => (
                    <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mChip, meal === m && styles.mChipSel]} testID={`pf-meal-${m}`}>
                      <Text style={[styles.mChipT, meal === m && { color: '#fff' }]}>{mealLabel[m]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={logAll} style={[styles.cta, { alignSelf: 'stretch', marginTop: 16 }]} disabled={items.length === 0} testID="pf-log-all">
                  <Text style={styles.ctaTxt}>Log {items.length} item{items.length === 1 ? '' : 's'}</Text>
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
  cta: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  itemCard: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: radius.lg, ...shadow.card, marginBottom: 8, alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  itemKcal: { fontSize: 16, fontWeight: '800', color: colors.brand },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.brandLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  badgeTxt: { fontSize: 10, color: colors.brandDark, fontWeight: '800' },
  mChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mChipT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
});
