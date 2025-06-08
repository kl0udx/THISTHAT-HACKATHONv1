import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { ChatService, ChatMessage as ChatMessageType } from '../services/chatService';
import { subscribeToChatMessages, subscribeToTypingIndicators, subscribeToMessageReactions, TypingManager } from '../lib/realtimeChat';

interface ChatPanelProps {
  roomId: string;
  userId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatPanel({ roomId, userId, isOpen, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessageType | null>(null);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingManagerRef = useRef(new TypingManager());
  const messageIdsRef = useRef(new Set<string>());
  const chatChannelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const reactionChannelRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadChatHistory();
    }
  }, [isOpen, roomId]);

  useEffect(() => {
    if (!isOpen) return;

    console.log('🔄 ChatPanel: Setting up real-time subscriptions for room:', roomId);

    // Clean up existing subscriptions first
    if (chatChannelRef.current) {
      console.log('🧹 ChatPanel: Cleaning up existing chat subscription');
      chatChannelRef.current.unsubscribe();
    }
    if (typingChannelRef.current) {
      console.log('🧹 ChatPanel: Cleaning up existing typing subscription');
      typingChannelRef.current.unsubscribe();
    }
    if (reactionChannelRef.current) {
      console.log('🧹 ChatPanel: Cleaning up existing reaction subscription');
      reactionChannelRef.current.unsubscribe();
    }

    // Set up new subscriptions
    chatChannelRef.current = subscribeToChatMessages(roomId, (newMessage) => {
      console.log('📨 ChatPanel: INSTANT message received:', newMessage);
      
      // Prevent duplicates using Set for O(1) lookup
      if (messageIdsRef.current.has(newMessage.id)) {
        console.log('🔄 ChatPanel: Duplicate message ignored:', newMessage.id);
        return;
      }
      
      messageIdsRef.current.add(newMessage.id);
      
      // Add message immediately to state
      setMessages(prev => {
        const newMessages = [...prev, newMessage];
        console.log(`📝 ChatPanel: Message added instantly! Total: ${newMessages.length}`);
        return newMessages;
      });
    });

    typingChannelRef.current = subscribeToTypingIndicators(roomId, (data) => {
      if (data.userId === userId) {
        console.log('⌨️ ChatPanel: Ignoring own typing indicator');
        return;
      }

      console.log('⌨️ ChatPanel: Processing typing indicator:', data);

      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.userId !== data.userId);
        if (data.isTyping) {
          console.log('⌨️ ChatPanel: Adding typing user:', data.displayName);
          return [...filtered, { userId: data.userId, displayName: data.displayName }];
        } else {
          console.log('⌨️ ChatPanel: Removing typing user:', data.displayName);
          return filtered;
        }
      });

      // Auto-cleanup stale typing indicators after 12 seconds
      if (data.isTyping) {
        setTimeout(() => {
          setTypingUsers(prev => {
            const updated = prev.filter(u => u.userId !== data.userId);
            if (updated.length !== prev.length) {
              console.log('🧹 ChatPanel: Auto-removed stale typing indicator for:', data.displayName);
            }
            return updated;
          });
        }, 12000);
      }
    });

    reactionChannelRef.current = subscribeToMessageReactions(roomId, (data) => {
      console.log('👍 ChatPanel: Reaction change received:', data);
      
      setMessages(prev => prev.map(message => {
        if (message.id === data.messageId) {
          const updatedReactions = { ...message.reactions };
          
          if (data.type === 'added') {
            if (!updatedReactions[data.reaction.emoji]) {
              updatedReactions[data.reaction.emoji] = [];
            }
            // Check if user already reacted with this emoji
            const existingIndex = updatedReactions[data.reaction.emoji].findIndex(
              r => r.userId === data.reaction.user.userId
            );
            if (existingIndex === -1) {
              updatedReactions[data.reaction.emoji].push(data.reaction.user);
            }
          } else if (data.type === 'removed') {
            if (updatedReactions[data.reaction.emoji]) {
              updatedReactions[data.reaction.emoji] = updatedReactions[data.reaction.emoji].filter(
                r => r.userId !== data.reaction.userId
              );
              if (updatedReactions[data.reaction.emoji].length === 0) {
                delete updatedReactions[data.reaction.emoji];
              }
            }
          }
          
          return { ...message, reactions: updatedReactions };
        }
        return message;
      }));
    });

    return () => {
      console.log('🧹 ChatPanel: Cleaning up subscriptions');
      if (chatChannelRef.current) {
        chatChannelRef.current.unsubscribe();
      }
      if (typingChannelRef.current) {
        typingChannelRef.current.unsubscribe();
      }
      if (reactionChannelRef.current) {
        reactionChannelRef.current.unsubscribe();
      }
      typingManagerRef.current.forceStopTyping(userId);
    };
  }, [isOpen, roomId, userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  const loadChatHistory = async () => {
    try {
      setIsLoading(true);
      console.log('📚 ChatPanel: Loading chat history for room:', roomId);
      const chatHistory = await ChatService.getChatHistory(roomId);
      console.log('📚 ChatPanel: Chat history loaded:', chatHistory.length, 'messages');
      setMessages(chatHistory);
      
      // Track existing message IDs to prevent duplicates
      messageIdsRef.current = new Set(chatHistory.map(m => m.id));
    } catch (error) {
      console.error('❌ ChatPanel: Failed to load chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string, replyToId?: string, fileData?: any) => {
    try {
      setIsSending(true);
      console.log('📤 ChatPanel: Sending message:', { content, fileData });
      
      const result = await ChatService.sendMessage({
        roomId,
        userId,
        content,
        replyTo: replyToId,
        fileData,
        messageType: fileData ? 'file' : 'text'
      });
      
      console.log('✅ ChatPanel: Message sent successfully:', result);
      setReplyTo(null);
    } catch (error) {
      console.error('❌ ChatPanel: Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleTyping = () => {
    console.log('⌨️ ChatPanel: User started typing');
    typingManagerRef.current.startTyping(userId);
  };

  const handleStopTyping = () => {
    console.log('⌨️ ChatPanel: User stopped typing');
    typingManagerRef.current.stopTyping(userId);
  };

  // Handle reaction updates locally for immediate feedback
  const handleReactionUpdate = (messageId: string, emoji: string, action: 'added' | 'removed', user: any) => {
    setMessages(prev => prev.map(message => {
      if (message.id === messageId) {
        const updatedReactions = { ...message.reactions };
        
        if (action === 'added') {
          if (!updatedReactions[emoji]) {
            updatedReactions[emoji] = [];
          }
          // Check if user already reacted with this emoji
          const existingIndex = updatedReactions[emoji].findIndex(r => r.userId === user.userId);
          if (existingIndex === -1) {
            updatedReactions[emoji].push(user);
          }
        } else if (action === 'removed') {
          if (updatedReactions[emoji]) {
            updatedReactions[emoji] = updatedReactions[emoji].filter(r => r.userId !== user.userId);
            if (updatedReactions[emoji].length === 0) {
              delete updatedReactions[emoji];
            }
          }
        }
        
        return { ...message, reactions: updatedReactions };
      }
      return message;
    }));
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-full shadow-lg transition-colors z-50 relative"
      >
        <MessageCircle className="w-6 h-6" />
        {typingUsers.length > 0 && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
        )}
        {/* Show typing count badge */}
        {typingUsers.length > 0 && (
          <div className="absolute -top-2 -left-2 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {typingUsers.length}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 h-96 bg-white rounded-xl shadow-2xl border flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-gray-900">Chat</h3>
          {typingUsers.length > 0 && (
            <div className="flex gap-1" title={`${typingUsers.map(u => u.displayName).join(', ')} typing...`}>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading messages...</div>
          </div>
        ) : messages.length === 0 && typingUsers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-gray-500">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                currentUserId={userId}
                onReply={setReplyTo}
                onReactionUpdate={handleReactionUpdate}
              />
            ))}
            
            {/* Enhanced typing indicator - always visible when someone is typing */}
            <TypingIndicator typingUsers={typingUsers} />
          </>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
        disabled={isSending}
      />
    </div>
  );
}