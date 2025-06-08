import { supabase } from '../lib/supabase';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface SendMessageRequest {
  roomId: string;
  userId: string;
  content: string;
  messageType?: 'text' | 'file' | 'system' | 'image';
  replyTo?: string;
  fileData?: {
    filename: string;
    size: number;
    mimeType: string;
    url?: string;
    type: 'image' | 'document' | 'video' | 'audio' | 'other';
  };
}

export interface ChatMessage {
  id: string;
  content: string;
  messageType: string;
  created_at: string;
  editedAt?: string;
  fileData?: {
    filename: string;
    size: number;
    mimeType: string;
    url?: string;
    type: 'image' | 'document' | 'video' | 'audio' | 'other';
  };
  user: {
    userId: string;
    displayName: string;
    userColor: string;
    avatarEmoji?: string;
  };
  replyTo?: {
    id: string;
    content: string;
    messageType: string;
    fileData?: any;
    user: { displayName: string; userColor: string };
  };
  reactions: Record<string, Array<{
    userId: string;
    displayName: string;
    userColor: string;
  }>>;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

export class ChatService {
  static async sendMessage(request: SendMessageRequest): Promise<ChatMessage> {
    const response = await fetch(`${API_BASE}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }

    const data = await response.json();
    return data.message;
  }

  static async getChatHistory(roomId: string, limit = 100, before?: string): Promise<ChatMessage[]> {
    const params = new URLSearchParams({
      roomId,
      limit: limit.toString(),
    });
    
    if (before) {
      params.append('before', before);
    }

    const response = await fetch(`${API_BASE}/get-messages?${params}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch chat history');
    }

    const data = await response.json();
    return data.messages;
  }

  static async addReaction(messageId: string, userId: string, emoji: string): Promise<{ action: 'added' | 'removed' }> {
    const response = await fetch(`${API_BASE}/add-reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messageId, userId, emoji }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add reaction');
    }

    return response.json();
  }

  static async updatePresence(userId: string, updates: { isOnline?: boolean; isTyping?: boolean }): Promise<void> {
    const response = await fetch(`${API_BASE}/update-presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ userId, ...updates }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update presence');
    }
  }

  // File utilities
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static getFileType(mimeType: string): 'image' | 'document' | 'video' | 'audio' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || 
        mimeType.includes('document') || 
        mimeType.includes('text') ||
        mimeType.includes('spreadsheet')) return 'document';
    return 'other';
  }

  static getFileIcon(mimeType: string): string {
    const type = this.getFileType(mimeType);
    
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      default: return '📎';
    }
  }

  static formatFileAttachment(file: File) {
    return {
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      type: this.getFileType(file.type)
    };
  }
}