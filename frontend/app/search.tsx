import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, shadow, mealLabel, mealOrder, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

const MEASURES: { key: string; label: string; grams: number }[] = [
  { key: 'cup', label: '1 cup', grams: 240 },
  { key: 'bowl', label: '1 bowl', grams: 350 },
  { key: 'plate', label: '1 plate', grams: 450 },
  { key: 'g100', label: '100 g', grams: 100 },
];

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const initialMeal = (params.meal as MealKey) || 'lunch';
  const date = (params.date as string) || todayStr();

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [picked, setPicked] = useState<any | null>(null);
  const [meal, setMeal] = useState<MealKey>(initialMeal);
  const [grams, setGrams] = useState('100');
  const [scanMenuOpen, setScanMenuOpen] = useState(false);

  useEffect(() => {
    const h = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); setHiddenCount(0); return; }
      setLoading(true);
      try {
        const j = await apiFetch(`/foods/search?q=${encodeURIComponent(q.trim())}`);
        setResults(j.results || []);
        setHiddenCount(j.hidden_count || 0);
      } catch { setResults([]); setHiddenCount(0); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const measures = useMemo(() => {
    const base = [...MEASURES];
    if (picked?.serving_grams && Math.round(picked.serving_grams) !== 100) {
      base.unshift({ key: 'serving', label: `1 serving (${picked.serving_label})`, grams: Math.round(picked.serving_grams) });
    }
    return base;
  }, [picked]);

  const pick = (item: any) => {
    setPicked(item);
    setGrams(String(Math.round(item.serving_grams || 100)));
  };

  const calc = useMemo(() => {
    if (!picked) return null;
    const g = Number(grams) || 0;
    const k = (picked.kcal_100g || 0) * g / 100;
    return {
      cal: Math.round(k),
      p: Math.round((picked.protein_100g || 0) * g / 100),
      c: Math.round((picked.carbs_100g || 0) * g / 100),
      f: Math.round((picked.fat_100g || 0) * g / 100),
    };
  }, [picked, grams]);

  const confirm = async () => {
    if (!picked || !calc) return;
    try {
      await apiFetch('/logs/food', {
        method: 'POST',
        body: JSON.stringify({
          date, meal,
          name: picked.name,
          brand: picked.brand || '',
          grams: Number(grams),
          calories: calc.cal,
          protein_g: calc.p,
          carbs_g: calc.c,
          fat_g: calc.f,
          source: picked.source === 'saved' ? 'saved' : 'openfoodfacts',
          off_code: picked.code,
        }),
      });
      router.back();
    } catch (e) { console.warn(e); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="search-close">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search foods…"
            style={styles.searchInput}
            autoFocus
            testID="search-input"
          />
        </View>
        <Pressable onPress={() => setScanMenuOpen(true)} style={styles.iconBtn} testID="open-camera">
          <Ionicons name="camera" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.code || r.name}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListHeaderComponent={
          hiddenCount > 0 ? (
            <Text style={styles.hiddenNote}>{hiddenCount} result{hiddenCount > 1 ? 's' : ''} hidden based on your diet preferences</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            {loading ? <ActivityIndicator color={colors.brand} /> : (
              <Text style={{ color: colors.muted }}>{q.length < 2 ? 'Type at least 2 characters' : 'No results'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.result} onPress={() => pick(item)} testID={`result-${item.code || item.name}`}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                {item.source === 'saved' && (
                  <View style={styles.savedTag}><Text style={styles.savedTagTxt}>Saved</Text></View>
                )}
              </View>
              <Text style={styles.resultSub} numberOfLines={1}>
                {item.brand ? `${item.brand} · ` : ''}{item.serving_label} · {item.serving_kcal} kcal
              </Text>
            </View>
            <Ionicons name="add-circle" size={26} color={colors.brand} />
          </Pressable>
        )}
      />

      <Modal transparent animationType="slide" visible={!!picked} onRequestClose={() => setPicked(null)}>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{picked?.name}</Text>
            <Text style={styles.sheetSub}>{picked?.brand || ''} · {picked?.serving_label} · {picked?.serving_kcal} kcal</Text>

            <Text style={styles.lbl}>Meal</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {mealOrder.map((m) => (
                <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mealChip, meal === m && styles.mealChipSel]} testID={`meal-${m}`}>
                  <Text style={[styles.mealChipTxt, meal === m && styles.mealChipTxtSel]}>{mealLabel[m]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.lbl}>Measure</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {measures.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setGrams(String(m.grams))}
                  style={[styles.measChip, Number(grams) === m.grams && styles.measChipSel]}
                  testID={`meas-${m.key}`}
                >
                  <Text style={[styles.measTxt, Number(grams) === m.grams && { color: colors.brand }]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.lbl}>Grams</Text>
            <TextInput value={grams} onChangeText={setGrams} keyboardType="number-pad" style={styles.gInput} testID="grams-input" />

            {calc && (
              <View style={styles.previewRow}>
                <PrevBox lbl="kcal" v={calc.cal} c={colors.brand} />
                <PrevBox lbl="P" v={`${calc.p}g`} c="#16a34a" />
                <PrevBox lbl="C" v={`${calc.c}g`} c="#eab308" />
                <PrevBox lbl="F" v={`${calc.f}g`} c="#f97316" />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable onPress={() => setPicked(null)} style={styles.cancelBtn} testID="log-cancel">
                <Text style={{ color: colors.onSurface, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirm} style={styles.addBtn} testID="log-confirm">
                <Text style={{ color: '#fff', fontWeight: '800' }}>Log to {mealLabel[meal]}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={scanMenuOpen} onRequestClose={() => setScanMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setScanMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add with camera</Text>
            <MenuRow
              icon="camera"
              title="Snap a meal"
              sub="AI identifies each dish and estimates macros"
              testID="scan-menu-meal"
              onPress={() => { setScanMenuOpen(false); router.push({ pathname: '/photo-food', params: { meal, date } }); }}
            />
            <MenuRow
              icon="receipt-outline"
              title="Scan a label"
              sub="Read a Nutrition Facts panel"
              testID="scan-menu-label"
              onPress={() => { setScanMenuOpen(false); router.push({ pathname: '/label-scan', params: { meal, date } }); }}
            />
            <MenuRow
              icon="barcode-outline"
              title="Scan barcode"
              sub="One-tap add a packaged product"
              testID="scan-menu-barcode"
              onPress={() => { setScanMenuOpen(false); router.push({ pathname: '/barcode-scan', params: { meal, date } }); }}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function MenuRow({ icon, title, sub, onPress, testID }: { icon: any; title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow} testID={testID}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuRowTitle}>{title}</Text>
        <Text style={styles.menuRowSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function PrevBox({ lbl, v, c }: { lbl: string; v: any; c: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary, padding: 10, borderRadius: 12, alignItems: 'center', marginRight: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{lbl}</Text>
      <Text style={{ fontSize: 18, color: c, fontWeight: '800' }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.md, gap: 8, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  result: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: radius.lg, marginBottom: 8, ...shadow.card },
  resultName: { fontSize: 15, color: colors.onSurface, fontWeight: '700' },
  resultSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  hiddenNote: { fontSize: 12, color: colors.muted, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  lbl: { fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  mealChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mealChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mealChipTxt: { color: colors.onSurface, fontWeight: '700', fontSize: 12 },
  mealChipTxtSel: { color: '#fff' },
  measChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  measChipSel: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  measTxt: { color: colors.onSurface, fontWeight: '600', fontSize: 13 },
  gInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, color: colors.onSurface },
  previewRow: { flexDirection: 'row', marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, alignItems: 'center' },
  addBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: 'center' },
  savedTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandLight },
  savedTagTxt: { fontSize: 10, fontWeight: '800', color: colors.brandDark, textTransform: 'uppercase' },
  menuBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 32 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  menuRowTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  menuRowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
