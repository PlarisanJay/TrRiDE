import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED } from '../../theme';

export default function MessagesScreen({ userRole, userProfile, onBack }) {
  const isStudent = userRole === 'student';
  const partnerName = isStudent ? 'Ricardo D.' : 'Maria Santos';
  const partnerPhoto = isStudent
    ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHrUqjh1_Dx4CkinxDH3eCGrHOyBvrRGV9U1UHJcRzRJwhCIo7_o4TeJZsp99lQMHSq1FDGq1PMI1b-M-8DGidadi_qVzhqNInzwMPDWULfRTGV2hF8G356GRWEDoqx-p7tS_CACxa3KbUQfWPmcuPgwrH2B2He5eyfzBoURSa9IltfRFo7a2VXVdsRaGnxut_1J6rOdO0ENTtoMcTif7X3t3mmyggaBqHRdKMFFVKz3bo7jJ40oaAlaF7_sty6hiZ7prXgkuMbYM' // Driver
    : 'https://lh3.googleusercontent.com/aida-public/AB6AXuAWW2Ew5JOK6nOmg_SJG8BEVpX7y2ZUfEKtKXMxMogPBDP4e7fD63R4g1cyM-fyZRdFind_L3t3lH7A5vx-2Yvtwnd8j24MSaYEpOATply1WyJtOZheswbXoxGCbjzXLaZRjLAmjByknus1xxBEXPpP1YWk7lLs76Q63-9nMPVjlnBVwxJn9NyWJdtchvkzrMM7D694V2ZgsD0nJMcOK9jUTd-vQm3hksugwMb8HfH_Q9-05OhH8-DbwrfIexPtuq7gk4KJbDQUJUE'; // Student

  const initialMessages = [
    {
      id: '1',
      sender: 'partner',
      text: isStudent
        ? "Hello! I'm already at the pickup point near the university gate. Where exactly are you?"
        : "Hi, is this TriRide? I'm waiting near the gate.",
      time: '10:15 AM',
    },
    {
      id: '2',
      sender: 'me',
      text: isStudent
        ? "I'm just walking out of the Engineering building. Give me 2 minutes, please!"
        : "Yes, this is Ricardo. I'm already here near the gate.",
      time: '10:16 AM',
    },
    {
      id: '3',
      sender: 'partner',
      text: isStudent
        ? "No worries. Take your time. I've parked right in front of the convenience store."
        : "Great! I'm walking towards you. Just passing the main courtyard.",
      time: '10:17 AM',
    },
  ];

  const [messages, setMessages] = useState(initialMessages);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleSend = () => {
    if (inputText.trim() === '') return;

    const newMessage = {
      id: Date.now().toString(),
      sender: 'me',
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText('');
    scrollToBottom();

    // Simulate partner typing and replying after 2 seconds
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const replyMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'partner',
        text: 'Okay, copy that! See you in a bit.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, replyMessage]);
      scrollToBottom();
    }, 2000);
  };

  return (
    <KeyboardAvoidingView
      behavior={'padding'}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.partnerPhotoBtn}>
            <Image source={{ uri: partnerPhoto }} style={styles.partnerPhoto} />
          </View>
          <View style={styles.partnerDetails}>
            <Text style={styles.partnerName}>{partnerName}</Text>
            <Text style={styles.partnerStatus}>Active now</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerActionBtn}>
            <MaterialIcons name="call" size={22} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn}>
            <MaterialIcons name="more-vert" size={22} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Scroll Area */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        renderItem={({ item }) => {
          const isMe = item.sender === 'me';
          return (
            <View style={[styles.messageBubbleContainer, isMe ? styles.myMessageAlign : styles.partnerMessageAlign]}>
              <View
                style={[
                  styles.messageBubble,
                  isMe ? styles.myBubbleBg : styles.partnerBubbleBg,
                ]}
              >
                <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.partnerMessageText]}>
                  {item.text}
                </Text>
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{item.time}</Text>
                {isMe && (
                  <MaterialIcons name="done-all" size={14} color={COLORS.primary} style={styles.doubleCheck} />
                )}
              </View>
            </View>
          );
        }}
        ListHeaderComponent={() => (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>Today</Text>
          </View>
        )}
        ListFooterComponent={() =>
          isTyping ? (
            <View style={styles.typingContainer}>
              <View style={styles.typingDots}>
                <View style={[styles.typingDot, styles.dot1]} />
                <View style={[styles.typingDot, styles.dot2]} />
                <View style={[styles.typingDot, styles.dot3]} />
              </View>
              <Text style={styles.typingText}>{partnerName} is typing...</Text>
            </View>
          ) : null
        }
      />

      {/* Chat Input Bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputInner}>
          <TouchableOpacity style={styles.addBtn}>
            <MaterialIcons name="add-circle" size={24} color={COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="rgba(115, 118, 134, 0.5)"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <MaterialIcons name="send" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  header: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  partnerPhotoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  partnerPhoto: {
    width: '100%',
    height: '100%',
  },
  partnerDetails: {
    marginLeft: SPACING.xs,
  },
  partnerName: {
    ...TYPOGRAPHY.button,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  partnerStatus: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontSize: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerActionBtn: {
    padding: SPACING.xs,
  },
  messagesList: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 90,
  },
  dateSeparator: {
    alignSelf: 'center',
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginVertical: SPACING.md,
  },
  dateText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  messageBubbleContainer: {
    marginBottom: SPACING.md,
    maxWidth: '75%',
  },
  myMessageAlign: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  partnerMessageAlign: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  myBubbleBg: {
    backgroundColor: COLORS.primaryContainer,
    borderTopRightRadius: 0,
  },
  partnerBubbleBg: {
    backgroundColor: COLORS.surfaceContainer,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(195, 198, 215, 0.3)',
  },
  messageText: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
  },
  myMessageText: {
    color: '#ffffff',
  },
  partnerMessageText: {
    color: COLORS.onSurface,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 10,
    color: COLORS.outline,
  },
  doubleCheck: {
    marginLeft: 2,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.outline,
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  typingText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.outline,
  },
  inputBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? 25 : 12,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
    gap: SPACING.xs,
  },
  addBtn: {
    padding: SPACING.xs,
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 24,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    minHeight: 40,
    maxHeight: 100,
  },
  textInput: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    color: COLORS.onSurface,
    paddingVertical: 6,
  },
  sendBtn: {
    padding: SPACING.xs,
  },
});
