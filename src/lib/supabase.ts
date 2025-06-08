import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Optimized real-time subscription for participant updates
export function subscribeToRoomParticipants(roomId: string, callback: (data: any) => void) {
  console.log('👥 Setting up participant subscription for room:', roomId);
  
  return supabase
    .channel(`participants_${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: roomId }
      }
    })
    .on('postgres_changes', {
      event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
      schema: 'public', 
      table: 'participants',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      console.log('👥 Participant change detected:', {
        event: payload.eventType,
        userId: payload.new?.user_id || payload.old?.user_id,
        displayName: payload.new?.display_name || payload.old?.display_name
      });
      callback(payload);
    })
    .subscribe((status) => {
      console.log('👥 Participant subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Participants: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Participants: SUBSCRIPTION FAILED');
      }
    });
}

// Real-time subscription for room updates
export function subscribeToRoom(roomId: string, callback: (data: any) => void) {
  return supabase
    .channel(`room_details_${roomId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public', 
      table: 'rooms',
      filter: `id=eq.${roomId}`
    }, callback)
    .subscribe();
}