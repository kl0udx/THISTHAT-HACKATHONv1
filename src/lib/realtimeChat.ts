import { supabase } from './supabase';
import { ChatService } from '../services/chatService';

// Optimized message subscription with instant delivery
export function subscribeToChatMessages(roomId: string, onMessage: (message: any) => void) {
  console.log('🚀 Setting up chat message subscription for room:', roomId);
  
  return supabase
    .channel(`chat_messages_${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: roomId }
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`
    }, async (payload) => {
      console.log('📨 INSTANT: Raw message payload received:', payload);
      
      try {
        // Build message immediately from payload data
        const messageData = payload.new;
        
        // Get user data in parallel (don't wait for it to block the message)
        const getUserData = async () => {
          const { data: participant } = await supabase
            .from('participants')
            .select('display_name, user_color, avatar_emoji')
            .eq('user_id', messageData.user_id)
            .single();
          
          return participant || { 
            display_name: 'Unknown User', 
            user_color: '#666666',
            avatar_emoji: '🐘'
          };
        };

        // Get reply data in parallel if exists
        const getReplyData = async () => {
          if (!messageData.reply_to) return null;
          
          const { data: replyMessage } = await supabase
            .from('messages')
            .select('id, content, message_type, file_data, user_id')
            .eq('id', messageData.reply_to)
            .single();

          if (!replyMessage) return null;

          const { data: replyUser } = await supabase
            .from('participants')
            .select('display_name, user_color')
            .eq('user_id', replyMessage.user_id)
            .single();

          return {
            id: replyMessage.id,
            content: replyMessage.content,
            messageType: replyMessage.message_type,
            fileData: replyMessage.file_data,
            user: { 
              displayName: replyUser?.display_name || 'Unknown User',
              userColor: replyUser?.user_color || '#666666'
            }
          };
        };

        // Execute both queries in parallel
        const [participant, replyTo] = await Promise.all([
          getUserData(),
          getReplyData()
        ]);

        const formattedMessage = {
          id: messageData.id,
          content: messageData.content,
          messageType: messageData.message_type,
          created_at: messageData.created_at,
          editedAt: messageData.edited_at,
          fileData: messageData.file_data,
          user: {
            userId: messageData.user_id,
            displayName: participant.display_name,
            userColor: participant.user_color,
            avatarEmoji: participant.avatar_emoji
          },
          replyTo,
          reactions: {} // Will be populated by separate subscription
        };

        console.log('✅ INSTANT: Message formatted and delivered to receiver:', formattedMessage);
        onMessage(formattedMessage);
      } catch (error) {
        console.error('❌ Failed to process new message:', error);
        
        // Fallback: deliver basic message even if user lookup fails
        const basicMessage = {
          id: payload.new.id,
          content: payload.new.content,
          messageType: payload.new.message_type,
          created_at: payload.new.created_at,
          editedAt: payload.new.edited_at,
          fileData: payload.new.file_data,
          user: {
            userId: payload.new.user_id,
            displayName: 'Unknown User',
            userColor: '#666666',
            avatarEmoji: '🐘'
          },
          replyTo: null,
          reactions: {}
        };
        
        console.log('🔄 FALLBACK: Delivering basic message:', basicMessage);
        onMessage(basicMessage);
      }
    })
    .subscribe((status) => {
      console.log('💬 Chat message subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Chat messages: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Chat messages: SUBSCRIPTION FAILED');
      }
    });
}

// Enhanced typing indicators with proper metadata handling
export function subscribeToTypingIndicators(roomId: string, onTypingChange: (data: any) => void) {
  console.log('⌨️ Setting up typing indicator subscription for room:', roomId);
  
  return supabase
    .channel(`typing_indicators_${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: roomId }
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'participants',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      console.log('⌨️ Raw typing payload received:', payload);
      
      const oldMetadata = payload.old?.metadata || {};
      const newMetadata = payload.new?.metadata || {};
      
      console.log('⌨️ Metadata comparison:', {
        old: oldMetadata,
        new: newMetadata,
        userId: payload.new.user_id,
        displayName: payload.new.display_name
      });
      
      // Check if typing status changed
      if (newMetadata.isTyping !== undefined && oldMetadata.isTyping !== newMetadata.isTyping) {
        const typingData = {
          userId: payload.new.user_id,
          displayName: payload.new.display_name,
          isTyping: newMetadata.isTyping
        };
        
        console.log('✅ Typing indicator change detected:', typingData);
        onTypingChange(typingData);
      } else {
        console.log('⌨️ No typing status change detected');
      }
    })
    .subscribe((status) => {
      console.log('⌨️ Typing indicator subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Typing indicators: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Typing indicators: SUBSCRIPTION FAILED');
      }
    });
}

// Subscribe to message reactions
export function subscribeToMessageReactions(roomId: string, onReactionChange: (data: any) => void) {
  console.log('👍 Setting up reaction subscription for room:', roomId);
  
  return supabase
    .channel(`reactions_${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: roomId }
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'message_reactions'
    }, async (payload) => {
      console.log('👍 Reaction change detected:', payload);
      
      // Get the message to check if it belongs to this room
      const messageId = payload.new?.message_id || payload.old?.message_id;
      if (!messageId) return;

      const { data: message } = await supabase
        .from('messages')
        .select('room_id')
        .eq('id', messageId)
        .single();

      // Only process reactions for messages in this room
      if (!message || message.room_id !== roomId) {
        console.log('👍 Reaction not for this room, ignoring');
        return;
      }
      
      if (payload.eventType === 'INSERT') {
        // Get user data for the reaction
        const { data: user } = await supabase
          .from('participants')
          .select('display_name, user_color')
          .eq('user_id', payload.new.user_id)
          .single();

        onReactionChange({
          type: 'added',
          messageId: payload.new.message_id,
          reaction: {
            emoji: payload.new.emoji,
            user: {
              userId: payload.new.user_id,
              displayName: user?.display_name || 'Unknown User',
              userColor: user?.user_color || '#666666'
            }
          }
        });
      } else if (payload.eventType === 'DELETE') {
        onReactionChange({
          type: 'removed',
          messageId: payload.old.message_id,
          reaction: {
            emoji: payload.old.emoji,
            userId: payload.old.user_id
          }
        });
      }
    })
    .subscribe((status) => {
      console.log('👍 Reaction subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Reactions: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Reactions: SUBSCRIPTION FAILED');
      }
    });
}

// Improved typing manager with better state tracking and longer timeouts
export class TypingManager {
  private typingTimeouts = new Map<string, NodeJS.Timeout>();
  private isCurrentlyTyping = false;
  private lastTypingTime = 0;
  
  startTyping(userId: string) {
    const now = Date.now();
    
    // Throttle typing updates (max once per 2 seconds)
    if (this.isCurrentlyTyping && (now - this.lastTypingTime) < 2000) {
      this.resetTimeout(userId);
      return;
    }

    console.log('⌨️ TypingManager: Starting typing for user:', userId);
    this.isCurrentlyTyping = true;
    this.lastTypingTime = now;
    
    // Update typing status
    ChatService.updatePresence(userId, { isTyping: true })
      .then(() => console.log('✅ Typing status set to true'))
      .catch(error => console.error('❌ Failed to set typing status:', error));
    
    this.resetTimeout(userId);
  }
  
  private resetTimeout(userId: string) {
    // Clear existing timeout
    if (this.typingTimeouts.has(userId)) {
      clearTimeout(this.typingTimeouts.get(userId)!);
    }
    
    // Set timeout to stop typing after 10 seconds (reasonable timeout)
    const timeout = setTimeout(() => {
      this.stopTyping(userId);
    }, 10000);
    
    this.typingTimeouts.set(userId, timeout);
  }
  
  stopTyping(userId: string) {
    if (!this.isCurrentlyTyping) return;
    
    console.log('⌨️ TypingManager: Stopping typing for user:', userId);
    this.isCurrentlyTyping = false;
    
    if (this.typingTimeouts.has(userId)) {
      clearTimeout(this.typingTimeouts.get(userId)!);
      this.typingTimeouts.delete(userId);
    }
    
    ChatService.updatePresence(userId, { isTyping: false })
      .then(() => console.log('✅ Typing status set to false'))
      .catch(error => console.error('❌ Failed to clear typing status:', error));
  }
  
  forceStopTyping(userId: string) {
    console.log('⌨️ TypingManager: Force stopping typing for user:', userId);
    this.isCurrentlyTyping = false;
    
    if (this.typingTimeouts.has(userId)) {
      clearTimeout(this.typingTimeouts.get(userId)!);
      this.typingTimeouts.delete(userId);
    }
    
    ChatService.updatePresence(userId, { isTyping: false }).catch(console.error);
  }
}