import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { buddyStream } from '@/src/api';

type Msg = { role: 'user' | 'buddy'; text: string };

const SUGGESTIONS = [
  'What should I eat for dinner?',
  'Give me a high-protein snack idea',
  "I'm 30g protein short — help",
  'Recipe under 500 kcal?',
];

export default function Buddy() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (raw?: string) => {
    const q = (raw ?? text).trim();
    if (!q || sending) return;
    setText('');
    setSending(true);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'buddy', text: '' }]);
    try {
      let acc = '';
      for await (const chunk of buddyStream(q)) {
        acc += chunk;
        setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'buddy', text: acc };
          return copy;
        });
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 10);
      }
    } catch (e: any) {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'buddy', text: 'Sorry, something went wrong.' };
        return copy;
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <View style={styles.header}>
          <View style={styles.avatar}><Ionicons name="leaf" size={20} color={colors.brand} /></View>
          <View>
            <Text style={styles.title}>Buddy</Text>
            <Text style={styles.sub}>Your AI food coach</Text>
          </View>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.chatBody} showsVerticalScrollIndicator={false}>
          {msgs.length === 0 && (
            <View style={{ padding: spacing.md }}>
              <Text style={styles.emptyH}>Ask me anything</Text>
              <Text style={styles.emptyP}>I know your goals, today's macros, and your dietary preferences.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} onPress={() => send(s)} style={styles.suggest} testID={`buddy-sugg-${s.slice(0,10)}`}>
                    <Text style={styles.suggestTxt}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {msgs.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
              <Text style={m.role === 'user' ? styles.txtUser : styles.txtBot}>{m.text || '…'}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message Buddy…"
            style={styles.input}
            editable={!sending}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            testID="buddy-input"
          />
          <Pressable
            onPress={() => send()}
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            disabled={!text.trim() || sending}
            testID="buddy-send-btn"
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', padding: spacing.lg, alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  chatBody: { padding: spacing.lg, paddingBottom: spacing.xl },
  emptyH: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  emptyP: { fontSize: 14, color: colors.muted, marginTop: 4 },
  suggest: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  suggestTxt: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4, ...shadow.card },
  txtUser: { color: '#fff', fontSize: 15, lineHeight: 21 },
  txtBot: { color: colors.onSurface, fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: 'row', padding: spacing.md, paddingBottom: spacing.lg, gap: 8, alignItems: 'center', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 18, height: 44, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
