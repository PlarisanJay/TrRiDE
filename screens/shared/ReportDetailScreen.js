import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getReportMessages, sendReportMessage } from '../../data/reports';

export default function ReportDetailScreen({ userProfile, report, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = async () => {
    if (!report?.id) return;
    setLoading(true);
    const data = await getReportMessages(report.id);
    setMessages(data);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    load();
  }, [report?.id]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendReportMessage(report.id, userProfile.id, text.trim());
      setText('');
      await load();
    } catch (e) {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Report Thread</Text>
          <Text style={styles.headerSubtitle}>{report.reason} • {report.status.replace('_', ' ')}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No messages yet. Admin will respond here.</Text>
            </View>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === userProfile.id;
              return (
                <View key={msg.id} style={[styles.msgRow, isMine && styles.msgRowMine]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{msg.content}</Text>
                    <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.onSurfaceVariant}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !text.trim()}>
          {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <MaterialIcons name="send" size={20} color="#ffffff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.onSurface },
  headerSubtitle: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, textTransform: 'capitalize' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesContent: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant },
  msgRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  msgRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: ROUNDED.lg, padding: SPACING.sm, paddingHorizontal: SPACING.md },
  bubbleOther: { backgroundColor: COLORS.surfaceContainerHigh },
  bubbleMine: { backgroundColor: COLORS.primary },
  msgText: { ...TYPOGRAPHY.body, color: COLORS.onSurface },
  msgTextMine: { color: '#ffffff' },
  msgTime: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMine: { color: 'rgba(255,255,255,0.8)' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainerHigh,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
