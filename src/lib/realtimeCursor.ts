import { supabase } from './supabase';
import { CursorPosition } from '../services/cursorService';

export function subscribeToCursorUpdates(
  roomId: string, 
  onCursorUpdate: (cursor: CursorPosition) => void,
  currentUserId: string
) {
  console.log('🖱️ Setting up cursor tracking subscription for room:', roomId);
  
  return supabase
    .channel(`cursors_${roomId}`, {
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
      // Only process cursor updates (ignore other participant updates)
      const oldCursor = { x: payload.old?.cursor_x, y: payload.old?.cursor_y };
      const newCursor = { x: payload.new?.cursor_x, y: payload.new?.cursor_y };
      
      // Skip if cursor didn't actually move
      if (oldCursor.x === newCursor.x && oldCursor.y === newCursor.y) {
        return;
      }

      // Skip own cursor updates
      if (payload.new.user_id === currentUserId) {
        return;
      }

      console.log('🖱️ Cursor update detected:', {
        userId: payload.new.user_id,
        displayName: payload.new.display_name,
        from: oldCursor,
        to: newCursor
      });

      const cursorUpdate: CursorPosition = {
        userId: payload.new.user_id,
        displayName: payload.new.display_name,
        userColor: payload.new.user_color,
        avatarEmoji: payload.new.avatar_emoji || '🐘',
        x: payload.new.cursor_x,
        y: payload.new.cursor_y,
        updatedAt: payload.new.cursor_updated_at,
        platform: payload.new.current_platform,
        isOnline: payload.new.is_online
      };

      onCursorUpdate(cursorUpdate);
    })
    .subscribe((status) => {
      console.log('🖱️ Cursor subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Cursor tracking: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Cursor tracking: SUBSCRIPTION FAILED');
      }
    });
}

export class CursorTracker {
  private isTracking = false;
  private roomId: string;
  private userId: string;
  private updateQueue: Array<{ x: number; y: number; timestamp: number }> = [];
  private lastSentUpdate = 0;
  private batchInterval: NodeJS.Timeout | null = null;

  constructor(roomId: string, userId: string) {
    this.roomId = roomId;
    this.userId = userId;
  }

  startTracking() {
    if (this.isTracking) return;
    
    console.log('🖱️ CursorTracker: Starting cursor tracking');
    this.isTracking = true;

    // Add mouse move listener
    document.addEventListener('mousemove', this.handleMouseMove);
    
    // Start batch processing
    this.batchInterval = setInterval(() => {
      this.processBatch();
    }, 100); // Process every 100ms
  }

  stopTracking() {
    if (!this.isTracking) return;
    
    console.log('🖱️ CursorTracker: Stopping cursor tracking');
    this.isTracking = false;

    document.removeEventListener('mousemove', this.handleMouseMove);
    
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    
    this.updateQueue = [];
  }

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.isTracking) return;

    const now = Date.now();
    
    // Add to queue (keep only latest position)
    this.updateQueue = [{
      x: event.clientX,
      y: event.clientY,
      timestamp: now
    }];
  };

  private async processBatch() {
    if (this.updateQueue.length === 0) return;

    const latestUpdate = this.updateQueue[this.updateQueue.length - 1];
    const now = Date.now();

    // Only send if enough time has passed (throttle to 10 FPS)
    if (now - this.lastSentUpdate < 100) return;

    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-cursor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userId: this.userId,
          x: latestUpdate.x,
          y: latestUpdate.y,
          platform: this.detectPlatform()
        }),
      });

      this.lastSentUpdate = now;
      this.updateQueue = [];
    } catch (error) {
      console.error('🖱️ Failed to update cursor position:', error);
    }
  }

  private detectPlatform(): string {
    const hostname = window.location.hostname;
    if (hostname.includes('chatgpt') || hostname.includes('openai')) return 'ChatGPT';
    if (hostname.includes('claude') || hostname.includes('anthropic')) return 'Claude';
    if (hostname.includes('bolt') || hostname.includes('stackblitz')) return 'Bolt';
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return 'Local Development';
    return 'Unknown Platform';
  }
}