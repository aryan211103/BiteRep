import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { authAnon } from '@/src/api';
import { colors } from '@/src/theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const j = await authAnon();
        if (j.onboarded) router.replace('/(tabs)/home');
        else router.replace('/onboarding');
      } catch (e) {
        console.warn('auth failed', e);
      }
    })();
  }, []);

  return (
    <View style={styles.c} testID="splash-loading">
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
