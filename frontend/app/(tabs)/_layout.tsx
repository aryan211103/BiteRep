import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '@/src/theme';

function TabIcon({ name, color }: any) {
  return <Ionicons name={name} size={24} color={color} />;
}

function CenterPlus() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/search')}
      style={styles.fab}
      testID="tab-add-btn"
      android_ripple={{ color: '#166534', borderless: true }}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: '#FFFFFFEE',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="home" color={color} /> }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: ({ color }) => <TabIcon name="trending-up" color={color} /> }} />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarIcon: () => <CenterPlus />,
          tabBarLabel: () => null,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('home' as never);
          },
        })}
      />
      <Tabs.Screen name="buddy" options={{ title: 'Buddy', tabBarIcon: ({ color }) => <TabIcon name="chatbubble-ellipses" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon name="person" color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -22,
    ...shadow.cardStrong,
  },
});
