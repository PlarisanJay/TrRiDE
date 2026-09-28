import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  BackHandler,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  ELEVATION,
  GRADIENTS,
  INK,
  CANVAS,
  ACCENT,
} from '../../theme';
import UserAvatar from '../../components/UserAvatar';
import {
  getConversations,
  getConversationByTripId,
  getMessagesByConversation,
  getMessagesByTrip,
  sendMessage,
  subscribeToMessages,
  subscribeToAllUserMessages,
  markConversationAsRead,
  deleteMessage,
  deleteConversation,
} from '../../data/messages';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../config/supabase';
import { imageUriToArrayBuffer } from '../../data/auth';


const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢'];

/**
 * Format a conversation timestamp into a human-friendly relative label.
 */
const formatConversationTime = (value) => {
  if (!value) return 'Today';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfToday.getDay());
  if (date >= startOfWeek) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function MessagesScreen({ userRole, userProfile, tripId, onBack, onChatOpen, onChatClose, onMessagesRead }) {
  const isStudent = userRole === 'student';
  const currentUserId = userProfile?.id || (isStudent ? 'student_123' : 'driver_456');

// State: 'inbox' or 'chat'
  const [viewMode, setViewMode] = useState(tripId ? 'chat' : 'inbox');
  const [loadingChat, setLoadingChat] = useState(Boolean(tripId));
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [selectedConv, setSelectedConv] = useState(null);

  // Active Chat State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [pendingImageUri, setPendingImageUri] = useState(null);
  const [pendingImageBase64, setPendingImageBase64] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [avatarErrors, setAvatarErrors] = useState({});
  const [fullViewImage, setFullViewImage] = useState(null);
  const flatListRef = useRef(null);
  const unsubRef = useRef(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [reactions, setReactions] = useState({}); // { messageId: { emoji, userId } }

  // Default partner fallback info
  const defaultPartnerName = isStudent ? 'TriRide Driver' : 'Student Rider';
  const defaultPartnerPhoto = null;

  // Handle hardware back press when inside a chat thread
  useEffect(() => {
    const onHardwareBack = () => {
      if (viewMode === 'chat') {
        if (tripId) {
          if (onChatClose) onChatClose();
          onBack();
        } else {
          if (onChatClose) onChatClose();
          setViewMode('inbox');
        }
        return true;
      }
      return false;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => backSub.remove();
  }, [viewMode, tripId, onChatClose, onBack]);

  // Load Conversations list & setup realtime inbox listener
  const refreshConversations = async () => {
    const convs = await getConversations(currentUserId, userRole);
    setConversations(convs || []);
    setLoadingConvs(false);
    return convs || [];
  };

  // When tripId is provided (from current order/ride), directly open chat with zero delay
  useEffect(() => {
    if (!tripId) return;
    let isMounted = true;
    setViewMode('chat');
    setLoadingChat(true);
    if (onChatOpen) onChatOpen();

    getConversationByTripId(tripId, currentUserId, userRole)
      .then((directConv) => {
        if (isMounted && directConv) {
          openChatThread(directConv);
        }
      })
      .catch((err) => {
        console.warn('Error loading trip conversation:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingChat(false);
      });
  }, [tripId, currentUserId, userRole]);

  // When NO tripId (viewing all messages from navigation), load inbox list
  useEffect(() => {
    if (tripId) return;
    let isMounted = true;
    setLoadingConvs(true);
    refreshConversations().finally(() => {
      if (isMounted) setLoadingConvs(false);
    });

    const unsubInbox = subscribeToAllUserMessages(currentUserId, () => {
      if (isMounted) {
        getConversations(currentUserId, userRole).then((updated) => {
          if (isMounted && updated) setConversations(updated);
        });
      }
    });

    return () => {
      isMounted = false;
      if (unsubInbox) unsubInbox();
    };
  }, [currentUserId, userRole, tripId]);

  // Notify parent when leaving chat view
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
      if (onChatClose) onChatClose();
    };
  }, []);

  // Open a conversation thread and load real messages
  const openChatThread = async (conv) => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    setSelectedConv(conv);
    setViewMode('chat');
    if (onChatOpen) onChatOpen();

    // Mark as read in local state
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread: false } : c))
    );

    // Persist read state asynchronously without blocking UI
    markConversationAsRead(conv.id, userRole).catch(() => {});
    if (onMessagesRead) onMessagesRead();

    // Load real messages from DB
    try {
      let dbMessages = [];
      if (conv.id) {
        dbMessages = await getMessagesByConversation(conv.id);
      }
      if ((!dbMessages || dbMessages.length === 0) && conv.trip_id) {
        dbMessages = await getMessagesByTrip(conv.trip_id);
      }

      const formatted = (dbMessages || []).map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        text: m.content,
        media_url: m.media_url || null,
        time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
      }));
      setMessages(formatted);
    } catch (e) {
      console.warn('Could not load messages:', e.message);
      setMessages([]);
    }

    // Subscribe to new messages in real-time
    const unsub = subscribeToMessages(
      { conversationId: conv.id, tripId: conv.trip_id },
      (newMsg) => {
        const formattedMsg = {
          id: newMsg.id,
          sender_id: newMsg.sender_id,
          text: newMsg.content,
          media_url: newMsg.media_url || null,
          time: newMsg.created_at
            ? new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
        };

        setMessages((prev) => {
          // If message already exists by ID, skip
          if (prev.some((m) => m.id === formattedMsg.id)) {
            return prev;
          }
          // If replacing an optimistic message sent locally
          const matchIndex = prev.findIndex(
            (m) => m.sender_id === formattedMsg.sender_id && m.text === formattedMsg.text && m.id.startsWith('temp_')
          );
          if (matchIndex !== -1) {
            const copy = [...prev];
            copy[matchIndex] = formattedMsg;
            return copy;
          }
          return [...prev, formattedMsg];
        });

        scrollToBottom();
      }
    );
    unsubRef.current = unsub;
  };

  // Scroll chat to bottom
  const scrollToBottom = () => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  // Handle Send Message
  const handleSend = async () => {
    if (!inputText.trim()) return;

    const newMsgText = inputText.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tempId = `temp_${Date.now()}`;

    const optimisticMsg = {
      id: tempId,
      sender_id: currentUserId,
      text: newMsgText,
      time: timeStr,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');
    scrollToBottom();

    // Send to Supabase DB
    const targetTripId = selectedConv?.trip_id || tripId;
    // sendMessage resolves to null on failure (it logs and swallows), so both
    // a thrown error and a null result have to be treated as a failed send.
    // Previously the optimistic bubble was left on screen with its temp_ id and
    // no feedback at all, so the message just vanished.
    const rollback = () => {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(newMsgText);
    };

    try {
      const savedMsg = await sendMessage({
        tripId: targetTripId,
        conversationId: selectedConv?.id,
        senderId: currentUserId,
        text: newMsgText,
      });

      if (!savedMsg) {
        rollback();
        Alert.alert('Message not sent', 'Check your connection and try again.', [
          { text: 'OK' },
        ]);
        return;
      }

      // If the conversation_id was auto-created inside sendMessage,
      // update our local selectedConv so future messages and realtime work
      if (savedMsg.conversation_id && (!selectedConv?.id || selectedConv.id !== savedMsg.conversation_id)) {
        setSelectedConv((prev) => ({
          ...prev,
          id: savedMsg.conversation_id,
        }));
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                id: savedMsg.id,
                sender_id: savedMsg.sender_id,
                text: savedMsg.content,
                time: savedMsg.created_at
                  ? new Date(savedMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : timeStr,
              }
            : m
        )
      );
    } catch (e) {
      rollback();
      Alert.alert('Message not sent', 'Check your connection and try again.', [
        { text: 'OK' },
      ]);
    }
  };

  const displayList = conversations;

  // Render Inbox Screen
  if (viewMode === 'inbox') {
    return (
      <View style={styles.container}>
        {/* Inbox Header */}
        <View style={styles.inboxHeader}>
          <View style={styles.inboxHeaderLeft}>
            <Text style={styles.inboxTitle}>Messages</Text>
          </View>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <MaterialIcons name="search" size={26} color={INK.body} />
          </TouchableOpacity>
        </View>

        {loadingConvs ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : displayList.length === 0 ? (
          <View style={styles.centered}>
            <MaterialIcons name="chat-bubble-outline" size={48} color={COLORS.outline} />
            <Text style={styles.loadingText}>No conversations yet</Text>
          </View>
        ) : (
          <FlatList
            data={displayList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.inboxList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const name = item.partner_name || defaultPartnerName;
              const photo = item.partner_photo || defaultPartnerPhoto;
              const isUnread = item.unread;
              const timeStr = formatConversationTime(item.time);
              const messageSnippet = item.last_message || 'Tap to start messaging...';

              return (
                <TouchableOpacity
                  style={[styles.convCard, isUnread && styles.convCardUnread]}
                  activeOpacity={0.8}
                  onPress={() => openChatThread(item)}
                  onLongPress={() => {
                    Alert.alert(
                      'Delete Conversation',
                      `Are you sure you want to delete conversation with ${name}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            const ok = await deleteConversation(item.id);
                            if (ok) {
                              setConversations((prev) => prev.filter((c) => c.id !== item.id));
                              Alert.alert('Deleted', 'Conversation deleted.');
                            } else {
                              Alert.alert('Error', 'Could not delete conversation.');
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <View style={styles.avatarWrapper}>
                    <UserAvatar uri={photo} name={name} size={48} />
                  </View>

                  <View style={styles.convDetails}>
                    <Text style={styles.convName} numberOfLines={1}>{name}</Text>
                    <Text style={[styles.convPreview, isUnread && styles.unreadPreview]} numberOfLines={1}>
                      {messageSnippet} • {timeStr}
                    </Text>
                  </View>

                  {isUnread && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  if (viewMode === 'chat' && loadingChat && !selectedConv) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              if (onChatClose) onChatClose();
              onBack();
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { marginLeft: 8 }]}>Connecting to Chat...</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  // Render Active Chat Thread View
  const partnerName = selectedConv?.partner_name || defaultPartnerName;
  const partnerPhoto = selectedConv?.partner_photo || defaultPartnerPhoto;

  return (
    <KeyboardAvoidingView
      // 'padding' on both platforms. The old 'height' on Android shrank the
      // container a second time once app.json switched the window to
      // softwareKeyboardLayoutMode:"resize", which pushed the input bar off
      // the bottom of the screen. 'padding' just offsets for the keyboard.
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      style={styles.container}
    >
      {/* Chat Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              if (tripId) {
                if (onChatClose) onChatClose();
                onBack();
              } else {
                if (onChatClose) onChatClose();
                setViewMode('inbox');
              }
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.partnerPhotoBtn}>
            <UserAvatar uri={partnerPhoto} name={partnerName} size={40} />
          </View>

          <View style={styles.partnerDetails}>
            <Text style={styles.partnerName} numberOfLines={1}>{partnerName}</Text>
            <View style={styles.statusRow}>
              <View style={styles.activeDot} />
              <Text style={styles.partnerStatus}>Active on Ride</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => {
              const phone = selectedConv?.partner_phone;
              if (phone) {
                Linking.openURL(`tel:${phone}`).catch(() => {
                  Alert.alert('Cannot Call', 'Unable to open phone dialer.');
                });
              } else {
                Alert.alert('No Phone Number', 'This user has not added their phone number yet.');
              }
            }}
          >
            <MaterialIcons name="call" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          const msgReaction = reactions[item.id];
          return (
            <TouchableOpacity
              activeOpacity={0.9}
              onLongPress={() => setReactionTarget(item.id)}
              style={[styles.messageBubbleContainer, isMe ? styles.myMessageAlign : styles.partnerMessageAlign]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isMe ? styles.myBubbleBg : styles.partnerBubbleBg,
                ]}
              >
                {item.media_url ? (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setFullViewImage(item.media_url)}>
                    <Image
                      source={{ uri: item.media_url }}
                      style={{ width: 220, height: 220, borderRadius: 12, marginBottom: (item.text || item.content) ? 6 : 0 }}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ) : null}
                {(item.text || item.content) ? (
                  <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.partnerMessageText]}>
                    {item.text || item.content}
                  </Text>
                ) : null}
              </View>

              {msgReaction && (
                <View style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', marginTop: -4, marginBottom: 2 }}>
                  <View style={{ backgroundColor: COLORS.surfaceContainerHigh, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 14 }}>{msgReaction}</Text>
                  </View>
                </View>
              )}

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{item.time || 'Just now'}</Text>
                {isMe && (
                  <MaterialIcons name="done-all" size={14} color={COLORS.primary} style={styles.doubleCheck} />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={() => (
          <View style={styles.securityNote}>
            <MaterialIcons name="lock" size={14} color={COLORS.outline} />
            <Text style={styles.securityText}>
              Messages are restricted to active trip participants for privacy.
            </Text>
          </View>
        )}
      />

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputInner}>
          <TouchableOpacity
            style={{ padding: 8 }}
            activeOpacity={0.7}
            onPress={async () => {
              try {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission Required', 'Allow gallery access to select images.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images'],
                  allowsEditing: false,
                  quality: 0.7,
                  base64: true,
                });
                if (!result.canceled && result.assets?.[0]?.uri) {
                  setPendingImageUri(result.assets[0].uri);
                  setPendingImageBase64(result.assets[0].base64 || null);
                }
              } catch (e) {
                console.warn('Image picker error:', e.message);
              }
            }}
          >
            <MaterialIcons name="attach-file" size={24} color={COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="rgba(115, 118, 134, 0.6)"
              value={inputText}
              onChangeText={setInputText}
              multiline
              // Keep the newest messages on screen when the keyboard opens,
              // otherwise focus on a long thread shows stale history above.
              onFocus={() => scrollToBottom()}
            />
          </View>

          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <LinearGradient {...GRADIENTS.brandBright} style={styles.sendBtnFill}>
              <MaterialIcons name="send" size={22} color={CANVAS.raised} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Reaction & Action Picker Modal on Message Long Press */}
      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => setReactionTarget(null)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setReactionTarget(null)}>
          <View style={{ backgroundColor: CANVAS.raised, borderRadius: 20, padding: 16, alignItems: 'center', width: 280, ...ELEVATION.lg }}>
            {/* Emojis Row */}
            <Text style={{ fontSize: 13, color: INK.muted, fontWeight: '600', marginBottom: 10 }}>React to message</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    setReactions((prev) => ({ ...prev, [reactionTarget]: emoji }));
                    setReactionTarget(null);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: CANVAS.line, width: '100%', marginBottom: 12 }} />

            {/* Delete Message Action */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
              onPress={() => {
                const msgIdToDelete = reactionTarget;
                setReactionTarget(null);
                Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      const ok = await deleteMessage(msgIdToDelete);
                      if (ok) {
                        setMessages((prev) => prev.filter((m) => m.id !== msgIdToDelete));
                      } else {
                        Alert.alert('Error', 'Could not delete message.');
                      }
                    },
                  },
                ]);
              }}
            >
              <MaterialIcons name="delete" size={20} color={COLORS.error} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.error }}>Delete Message</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Image Preview & Confirmation Modal before sending */}
      <Modal visible={!!pendingImageUri} transparent animationType="slide" onRequestClose={() => setPendingImageUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxHeight: '80%', backgroundColor: CANVAS.raised, borderRadius: 20, overflow: 'hidden', padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: INK.strong, marginBottom: 12 }}>Send Image?</Text>
            
            {pendingImageUri && (
              <Image source={{ uri: pendingImageUri }} style={{ width: '100%', height: 260, borderRadius: 14, marginBottom: 16 }} resizeMode="contain" />
            )}

            <View style={{ flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: CANVAS.sunken, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={() => {
                  setPendingImageUri(null);
                  setPendingImageBase64(null);
                }}
                disabled={uploadingImage}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: INK.slate }}>Unselect / Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                disabled={uploadingImage}
                onPress={async () => {
                  setUploadingImage(true);
                  const imageUri = pendingImageUri;
                  const targetTripId = selectedConv?.trip_id || tripId;
                  try {
                    const arrayBuffer = await imageUriToArrayBuffer(imageUri, pendingImageBase64);
                    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                      throw new Error('Selected image could not be read.');
                    }
                    const fileExt = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
                    const filePath = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                    const contentType = `image/${fileExt === 'png' ? 'png' : 'jpeg'}`;

                    let targetBucket = 'chat-media';
                    let uploadRes = await supabase.storage.from(targetBucket).upload(filePath, arrayBuffer, { contentType, upsert: false });

                    if (uploadRes.error && (uploadRes.error.message?.includes('not found') || uploadRes.error.statusCode === '404')) {
                      targetBucket = 'message';
                      uploadRes = await supabase.storage.from(targetBucket).upload(filePath, arrayBuffer, { contentType, upsert: false });
                    }
                    if (uploadRes.error) throw uploadRes.error;

                    const { data: urlData } = supabase.storage.from(targetBucket).getPublicUrl(filePath);
                    const mediaUrl = urlData?.publicUrl;

                    const savedMsg = await sendMessage({
                      tripId: targetTripId,
                      conversationId: selectedConv?.id,
                      senderId: currentUserId,
                      text: '',
                      mediaUrl,
                      messageType: 'image',
                    });

                    if (savedMsg) {
                      const formatted = {
                        id: savedMsg.id,
                        sender_id: savedMsg.sender_id,
                        text: savedMsg.content,
                        media_url: savedMsg.media_url,
                        time: savedMsg.created_at
                          ? new Date(savedMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Just now',
                      };
                      setMessages((prev) => {
                        if (prev.some((m) => m.id === formatted.id)) return prev;
                        return [...prev, formatted];
                      });
                      scrollToBottom();
                    }
                    setPendingImageUri(null);
                    setPendingImageBase64(null);
                  } catch (e) {
                    console.warn('Image send failed:', e.message);
                    Alert.alert('Upload Failed', 'Could not send image. Please try again.');
                  } finally {
                    setUploadingImage(false);
                  }
                }}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={CANVAS.raised} />
                ) : (
                  <>
                    <MaterialIcons name="send" size={18} color={CANVAS.raised} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: CANVAS.raised }}>Send Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Lightbox Modal for Sent/Received Photos */}
      <Modal visible={!!fullViewImage} transparent animationType="fade" onRequestClose={() => setFullViewImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 45, right: 20, zIndex: 10, padding: 8 }} onPress={() => setFullViewImage(null)}>
            <MaterialIcons name="close" size={30} color={CANVAS.raised} />
          </TouchableOpacity>
          {fullViewImage && (
            <Image source={{ uri: fullViewImage }} style={{ width: '90%', height: '80%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    marginTop: 8,
  },
  // Inbox View Styles
  inboxHeader: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  inboxHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inboxTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: INK.body,
    letterSpacing: -0.5,
  },
  inboxList: {
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.md,
    paddingBottom: 100,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    position: 'relative',
  },
  convCardUnread: {
    backgroundColor: CANVAS.sunken,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: CANVAS.raised,
  },
  avatarInitialSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: CANVAS.raised,
  },
  convDetails: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 20,
  },
  convName: {
    fontSize: 16,
    fontWeight: '700',
    color: INK.strong,
    marginBottom: 4,
  },
  convPreview: {
    fontSize: 13,
    fontWeight: '400',
    color: INK.muted,
  },
  unreadPreview: {
    fontWeight: '600',
    color: INK.deep,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: ACCENT.indigo,
    position: 'absolute',
    top: 18,
    right: 16,
  },

  // Chat Thread View Styles
  header: {
    flexDirection: 'row',
    height: 64,
    paddingTop: 4,
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  // Was referenced by the chat-loading header but never defined, so
  // "Connecting to Chat..." rendered as unstyled default text.
  headerTitle: {
    ...TYPOGRAPHY.button,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  partnerPhotoBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  partnerPhoto: {
    width: '100%',
    height: '100%',
  },
  partnerDetails: {
    marginLeft: SPACING.xs,
    flex: 1,
  },
  partnerName: {
    ...TYPOGRAPHY.button,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT.greenBright,
  },
  partnerStatus: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginVertical: SPACING.md,
  },
  securityText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
  },
  messagesList: {
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 100,
  },
  messageBubbleContainer: {
    marginBottom: SPACING.md,
    maxWidth: '78%',
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
    borderRadius: 18,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  myBubbleBg: {
    backgroundColor: ACCENT.blueDeep,
    borderBottomRightRadius: 2,
    // Tinted lift so a sent bubble reads as raised without a hard outline.
    ...ELEVATION.xs,
  },
  partnerBubbleBg: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.xs,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: CANVAS.raised,
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
  inputBar: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.sm,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
    gap: SPACING.xs,
  },
  // Sunken field rather than an outlined box, so the input reads as a well
  // on the raised input bar.
  textInputWrapper: {
    flex: 1,
    backgroundColor: CANVAS.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 24,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    minHeight: 44,
    maxHeight: 100,
  },
  textInput: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    color: COLORS.onSurface,
    paddingVertical: 6,
  },
  // The gradient fill lives in the JSX.
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    ...ELEVATION.glow,
  },
  sendBtnFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
