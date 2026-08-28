import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing, shadow, mealOrder, mealLabel, MealKey } from '@/src/theme';
import { apiFetch } from '@/src/api';
import { todayStr } from '@/src/units';

type Status = 'idle' | 'looking' | 'found' | 'not_found' | 'error';

export default function BarcodeScan() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const date = (params.date as string) || todayStr();

  const [permission, requestPermission] = useCameraPermissions();
  const [meal, setMeal] = useState<MealKey>((params.meal as MealKey) || 'lunch');
  const [status, setStatus] = useState<Status>('idle');
  const [product, setProduct] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const lockRef = useRef(false);

  const onScanned = useCallback(async ({ data }: { data: string }) => {
    if (lockRef.current || !data) return;
    lockRef.current = true;
    setStatus('looking');
    try {
      const p = await apiFetch(`/foods/barcode/${encodeURIComponent(data)}`);
      setProduct(p);
      setStatus('found');
    } catch (e: any) {
      setStatus(e?.status === 404 ? 'not_found' : 'error');
    }
  }, []);

  const scanAgain = () => {
    lockRef.current = false;
    setStatus('idle');
    setProduct(null);
  };

  const addOneTap = async () => {
    if (!product || adding) return;
    setAdding(true);
    try {
      await apiFetch('/logs/food', {
        method: 'POST',
        body: JSON.stringify({
          date, meal,
          name: product.name,
          brand: product.brand || '',
          grams: product.serving_grams,
          calories: product.serving_kcal,
          protein_g: product.serving_protein,
          carbs_g: product.serving_carbs,
          fat_g: product.serving_fat,
          source: 'openfoodfacts',
          off_code: product.code,
        }),
      });
      router.replace('/(tabs)/home');
    } catch (e) { console.warn(e); }
    finally { setAdding(false); }
  };

  if (!permission) {
    return <SafeAreaView style={styles.safe} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="bc-close">
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Scan barcode</Text>
        </View>
        <View style={styles.centerBox}>
          <View style={styles.emptyIcon}><Ionicons name="barcode-outline" size={44} color={colors.brand} /></View>
          <Text style={styles.emptyH}>Scan a barcode</Text>
          <Text style={styles.emptyP}>We use your camera to look up a packaged product nutrition instantly.</Text>
          {permission.canAskAgain ? (
            <Pressable onPress={requestPermission} style={styles.cta} testID="bc-request-perm">
              <Text style={styles.ctaTxt}>Allow camera access</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => Linking.openSettings()} style={styles.cta} testID="bc-open-settings">
              <Text style={styles.ctaTxt}>Open Settings</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="bc-close">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Scan barcode</Text>
      </View>

      {status === 'idle' && (
        <View style={styles.cameraWrap}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={styles.frame} pointerEvents="none" />
          <Text style={styles.hint}>Point your camera at a barcode</Text>
        </View>
      )}

      {status === 'looking' && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.emptyP}>Looking it up…</Text>
        </View>
      )}

      {status === 'not_found' && (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.warning} />
          <Text style={styles.emptyH}>Not found</Text>
          <Text style={styles.emptyP}>We could not find this product in Open Food Facts. Try search instead.</Text>
          <Pressable onPress={scanAgain} style={styles.cta} testID="bc-scan-again">
            <Text style={styles.ctaTxt}>Scan again</Text>
          </Pressable>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.error} />
          <Text style={styles.emptyH}>Lookup failed</Text>
          <Text style={styles.emptyP}>Something went wrong. Check your connection and try again.</Text>
          <Pressable onPress={scanAgain} style={styles.cta} testID="bc-scan-again">
            <Text style={styles.ctaTxt}>Scan again</Text>
          </Pressable>
        </View>
      )}

      {status === 'found' && product && (
        <View style={{ padding: spacing.lg }}>
          <View style={styles.productCard} testID="bc-product-card">
            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
            {!!product.brand && <Text style={styles.productBrand}>{product.brand}</Text>}
            <Text style={styles.productServing}>{product.serving_label} · {product.serving_kcal} kcal</Text>
            <Text style={styles.productMacros}>P {product.serving_protein}g · C {product.serving_carbs}g · F {product.serving_fat}g</Text>
          </View>

          <Text style={styles.section}>Meal</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {mealOrder.map((m) => (
              <Pressable key={m} onPress={() => setMeal(m)} style={[styles.mChip, meal === m && styles.mChipSel]} testID={`bc-meal-${m}`}>
                <Text style={[styles.mChipT, meal === m && { color: '#fff' }]}>{mealLabel[m]}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={addOneTap} style={[styles.cta, { alignSelf: 'stretch', marginTop: 16 }, adding && { opacity: 0.6 }]} disabled={adding} testID="bc-add-one-tap">
            {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Add to {mealLabel[meal]}</Text>}
          </Pressable>
          <Pressable onPress={scanAgain} style={styles.secondaryBtn} testID="bc-scan-another">
            <Text style={styles.secondaryTxt}>Scan another</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.md, gap: 12, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, ...shadow.card },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  cameraWrap: { flex: 1, position: 'relative' },
  frame: { position: 'absolute', top: '35%', left: '12%', right: '12%', height: '18%', borderWidth: 3, borderColor: colors.brand, borderRadius: 16 },
  hint: { position: 'absolute', bottom: 40, alignSelf: 'center', color: '#fff', backgroundColor: '#00000088', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, fontWeight: '700', fontSize: 13 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 6 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyH: { fontSize: 20, fontWeight: '800', color: colors.onSurface, marginTop: 8 },
  emptyP: { fontSize: 14, color: colors.muted, marginTop: 4, textAlign: 'center' },
  cta: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  productCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  productName: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  productBrand: { fontSize: 13, color: colors.muted, marginTop: 2 },
  productServing: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 10 },
  productMacros: { fontSize: 13, color: colors.muted, marginTop: 4 },
  section: { fontSize: 13, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  mChip: { flex: 1, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mChipSel: { backgroundColor: colors.brand, borderColor: colors.brand },
  mChipT: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  secondaryBtn: { alignSelf: 'center', marginTop: 10, paddingVertical: 10 },
  secondaryTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
