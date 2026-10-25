import { supabase } from '../config/supabase';

/**
 * Get or create a conversation for a trip between a student and driver.
 */
export const getOrCreateConversation = async (tripId, studentId, driverId) => {
  try {
    const { data: existing, error: findErr } = await supabase
      .from('conversations')
      .select('*')
      .eq('trip_id', tripId)
      .single();

    if (!findErr && existing) return existing;

    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({ trip_id: tripId, student_id: studentId, driver_id: driverId })
      .select()
      .single();

    if (createErr) throw createErr;
    return created;
  } catch (err) {
    console.warn('Error getting/creating conversation:', err.message);
    return null;
  }
};

/**
 * Get conversations for a user (student or driver) with last message preview.
 */
export const getConversations = async (userId, userRole) => {
  try {
    const field = userRole === 'driver' ? 'driver_id' : 'student_id';
    const partnerField = userRole === 'driver' ? 'student_id' : 'driver_id';

    const { data: convData, error: convErr } = await supabase
      .from('conversations')
      .select(`
        id,
        trip_id,
        student_id,
        driver_id,
        student_last_read_at,
        driver_last_read_at,
        created_at,
        updated_at,
        trips (
          id,
          status,
          pickup_text,
          dest_text
        )
      `)
      .eq(field, userId)
      .order('updated_at', { ascending: false });

    if (convErr) throw convErr;
    if (!convData || convData.length === 0) return [];

    // 1. Batch fetch partner profiles in ONE query
    const partnerIds = [...new Set(convData.map((c) => c[partnerField]).filter(Boolean))];
    const profileMap = new Map();
    if (partnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone')
        .in('id', partnerIds);
      (profiles || []).forEach((p) => profileMap.set(p.id, p));
    }

    // 2. Batch fetch latest messages in ONE query
    const convIds = convData.map((c) => c.id).filter(Boolean);
    const lastMsgMap = new Map();
    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, sender_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      (msgs || []).forEach((m) => {
        if (!lastMsgMap.has(m.conversation_id)) {
          lastMsgMap.set(m.conversation_id, m);
        }
      });
    }

    const defaultPartner = userRole === 'driver' ? 'Student Rider' : 'TriRide Driver';

    const enriched = convData.map((conv) => {
      const partnerId = conv[partnerField];
      const partner = profileMap.get(partnerId);
      const partnerName = partner?.full_name || defaultPartner;
      const partnerPhoto = partner?.avatar_url || null;
      const partnerPhone = partner?.phone || null;

      const lastMsgObj = lastMsgMap.get(conv.id);
      const lastMessage = lastMsgObj ? lastMsgObj.content : null;
      const lastMessageTime = lastMsgObj ? lastMsgObj.created_at : null;

      const userLastReadAt = userRole === 'driver' ? conv.driver_last_read_at : conv.student_last_read_at;
      let unread = false;
      if (lastMsgObj) {
        const isFromPartner = lastMsgObj.sender_id !== userId;
        const notReadYet = !userLastReadAt || new Date(lastMessageTime).getTime() > new Date(userLastReadAt).getTime();
        unread = Boolean(isFromPartner && notReadYet);
      }

      return {
        id: conv.id,
        trip_id: conv.trip_id,
        student_id: conv.student_id,
        driver_id: conv.driver_id,
        partner_name: partnerName,
        partner_photo: partnerPhoto,
        partner_phone: partnerPhone,
        last_message: lastMessage,
        time: lastMessageTime,
        unread,
        updated_at: conv.updated_at,
      };
    });

    return enriched;
  } catch (err) {
    console.warn('Error getting conversations:', err.message);
    return [];
  }
};

/**
 * Get or create a conversation object by tripId with partner details, ready for direct chat.
 */
export const getConversationByTripId = async (tripId, currentUserId, userRole) => {
  try {
    if (!tripId) return null;

    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();

    let conv = existing;

    if (!conv) {
      const { data: tripData } = await supabase
        .from('trips')
        .select('student_id, driver_id')
        .eq('id', tripId)
        .single();

      if (tripData?.student_id && tripData?.driver_id) {
        conv = await getOrCreateConversation(tripId, tripData.student_id, tripData.driver_id);
      }
    }

    if (!conv) return null;

    const partnerField = userRole === 'driver' ? 'student_id' : 'driver_id';
    const partnerId = conv[partnerField];
    let partnerName = userRole === 'driver' ? 'Student Rider' : 'TriRide Driver';
    let partnerPhoto = null;
    let partnerPhone = null;

    if (partnerId) {
      const { data: partner } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, phone')
        .eq('id', partnerId)
        .single();

      if (partner) {
        partnerName = partner.full_name || partnerName;
        partnerPhoto = partner.avatar_url || null;
        partnerPhone = partner.phone || null;
      }
    }

    return {
      id: conv.id,
      trip_id: conv.trip_id,
      student_id: conv.student_id,
      driver_id: conv.driver_id,
      partner_name: partnerName,
      partner_photo: partnerPhoto,
      partner_phone: partnerPhone,
      unread: false,
      updated_at: conv.updated_at,
    };
  } catch (err) {
    console.warn('Error getConversationByTripId:', err.message);
    return null;
  }
};

/**
 * Get messages for a specific conversation.
 */
export const getMessagesByConversation = async (conversationId) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Error getting messages:', err.message);
    return [];
  }
};

/**
 * Get messages by trip ID (legacy support).
 */
export const getMessagesByTrip = async (tripId) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Error getting messages by trip:', err.message);
    return [];
  }
};

import { createNotification } from './notifications';
import { sendLocalNotification } from './pushNotifications';

/**
 * Send a message (text or image attachment).
 */
export const sendMessage = async ({ tripId, conversationId, senderId, text, mediaUrl, messageType = 'text' }) => {
  try {
    // If no conversationId, try to find or create one from the trip
    let resolvedConvId = conversationId;
    if (!resolvedConvId && tripId) {
      try {
        const { data: tripData } = await supabase
          .from('trips')
          .select('student_id, driver_id')
          .eq('id', tripId)
          .single();
        if (tripData && tripData.student_id && tripData.driver_id) {
          const conv = await getOrCreateConversation(tripId, tripData.student_id, tripData.driver_id);
          if (conv) resolvedConvId = conv.id;
        }
      } catch (convErr) {
        console.warn('Could not resolve conversation for trip:', convErr.message);
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        trip_id: tripId || null,
        conversation_id: resolvedConvId || null,
        sender_id: senderId,
        content: text || '',
        media_url: mediaUrl || null,
        message_type: messageType || 'text',
      })
      .select()
      .single();

    if (error) throw error;

    // Notify recipient about new message
    try {
      const convId = resolvedConvId || conversationId;
      if (convId) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('student_id, driver_id')
          .eq('id', convId)
          .single();
        if (conv) {
          const recipientId = conv.student_id === senderId ? conv.driver_id : conv.student_id;
          if (recipientId) {
            const preview = (text || '').substring(0, 100);
            createNotification({
              userId: recipientId,
              type: 'message',
              title: 'New Message',
              body: preview || 'You have a new message',
              data: { screen: 'Messages', tripId: tripId || null, conversationId: convId },
            }).catch(() => {});
            sendLocalNotification('New Message', preview || 'You have a new message', { screen: 'Messages', tripId: tripId || null, conversationId: convId }).catch(() => {});
          }
        }
      } else if (tripId) {
        const { data: tripData } = await supabase
          .from('trips')
          .select('student_id, driver_id')
          .eq('id', tripId)
          .single();
        if (tripData) {
          const recipientId = tripData.student_id === senderId ? tripData.driver_id : tripData.student_id;
          if (recipientId) {
            const preview = (text || '').substring(0, 100);
            createNotification({
              userId: recipientId,
              type: 'message',
              title: 'New Message',
              body: preview || 'You have a new message',
              data: { screen: 'Messages', tripId },
            }).catch(() => {});
            sendLocalNotification('New Message', preview || 'You have a new message', { screen: 'Messages', tripId }).catch(() => {});
          }
        }
      }
    } catch (e) {}

    return data;
  } catch (err) {
    console.warn('Error sending message:', err.message);
    return null;
  }
};

/**
 * Subscribe to realtime messages for a conversation or trip.
 */
export const subscribeToMessages = ({ conversationId, tripId }, callback) => {
  const uniqueSubId = Math.random().toString(36).substring(2, 9);
  const seenIds = new Set();

  const dedupedCallback = (msg) => {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);
    callback(msg);
  };

  // Prefer conversationId if available; also subscribe to tripId as fallback
  // to catch messages that may arrive with only a trip_id reference.
  const channels = [];

  if (conversationId) {
    const chName = `messages-conv-${conversationId}-${uniqueSubId}`;
    const ch = supabase.channel(chName);
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => { if (payload?.new) dedupedCallback(payload.new); }
    );
    ch.subscribe();
    channels.push(ch);
  }

  if (tripId) {
    const chName = `messages-trip-${tripId}-${uniqueSubId}`;
    const ch = supabase.channel(chName);
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
      (payload) => { if (payload?.new) dedupedCallback(payload.new); }
    );
    ch.subscribe();
    channels.push(ch);
  }

  // Fallback: if neither conversationId nor tripId, subscribe to all messages
  if (!conversationId && !tripId) {
    const chName = `messages-all-${uniqueSubId}`;
    const ch = supabase.channel(chName);
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => { if (payload?.new) dedupedCallback(payload.new); }
    );
    ch.subscribe();
    channels.push(ch);
  }

  return () => {
    channels.forEach((ch) => {
      try { supabase.removeChannel(ch); } catch (e) {}
    });
  };
};

/**
 * Global realtime subscription to any incoming message for the user to update unread badges.
 */
export const subscribeToAllUserMessages = (userId, onNewMessage) => {
  if (!userId) return () => {};

  const uniqueSubId = Math.random().toString(36).substring(2, 9);
  const channelName = `user-inbox-${userId}-${uniqueSubId}`;

  const channel = supabase.channel(channelName);

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      if (payload?.new && payload.new.sender_id !== userId) {
        onNewMessage(payload.new);
      }
    }
  );

  channel.subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {}
  };
};

/**
 * Get total unread conversations count for a user.
 */
export const getUnreadMessagesCount = async (userId, userRole) => {
  try {
    const convs = await getConversations(userId, userRole);
    return convs.filter((c) => c.unread).length;
  } catch (err) {
    return 0;
  }
};

/**
 * Mark a conversation as read for the current user (persists per user/role).
 */
export const markConversationAsRead = async (conversationId, userRole) => {
  try {
    const column = userRole === 'driver' ? 'driver_last_read_at' : 'student_last_read_at';
    const { error } = await supabase
      .from('conversations')
      .update({ [column]: new Date().toISOString() })
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Error marking conversation as read:', err.message);
    return false;
  }
};

// ── Delete a single message ─────────────────────────────────────
export const deleteMessage = async (messageId) => {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Error deleting message:', err.message);
    return false;
  }
};

// ── Delete an entire conversation & all its messages ────────────
export const deleteConversation = async (conversationId) => {
  try {
    // Delete all messages in the conversation first
    await supabase.from('messages').delete().eq('conversation_id', conversationId);

    // Delete the conversation row
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Error deleting conversation:', err.message);
    return false;
  }
};


