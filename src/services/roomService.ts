import { supabase } from '../lib/supabase';
import { CreateRoomRequest, CreateRoomResponse, JoinRoomRequest, JoinRoomResponse, RoomDetailsResponse } from '../types/room';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export class RoomService {
  static async createRoom(request: CreateRoomRequest): Promise<CreateRoomResponse> {
    const response = await fetch(`${API_BASE}/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create room');
    }

    return response.json();
  }

  static async getRoomDetails(roomCode: string): Promise<RoomDetailsResponse> {
    const response = await fetch(`${API_BASE}/get-room?roomCode=${encodeURIComponent(roomCode)}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get room details');
    }

    return response.json();
  }

  static async joinRoom(roomCode: string, request: JoinRoomRequest): Promise<JoinRoomResponse> {
    const response = await fetch(`${API_BASE}/join-room?roomCode=${encodeURIComponent(roomCode)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join room');
    }

    return response.json();
  }

  static async updateParticipant(userId: string, updates: { displayName?: string; isOnline?: boolean }): Promise<void> {
    const response = await fetch(`${API_BASE}/update-participant?userId=${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update participant');
    }
  }

  static async leaveRoom(userId: string): Promise<void> {
    await this.updateParticipant(userId, { isOnline: false });
  }
}