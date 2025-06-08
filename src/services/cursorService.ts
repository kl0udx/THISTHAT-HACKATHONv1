const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface CursorPosition {
  userId: string;
  displayName: string;
  userColor: string;
  avatarEmoji: string;
  x: number;
  y: number;
  updatedAt: string;
  platform?: string;
  isOnline: boolean;
}

export interface UpdateCursorRequest {
  userId: string;
  x: number;
  y: number;
  platform?: string;
}

export class CursorService {
  static async updateCursor(request: UpdateCursorRequest): Promise<CursorPosition> {
    const response = await fetch(`${API_BASE}/update-cursor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update cursor position');
    }

    const data = await response.json();
    return data.cursor;
  }

  static async getCursors(roomId: string): Promise<CursorPosition[]> {
    const response = await fetch(`${API_BASE}/get-cursors?roomId=${encodeURIComponent(roomId)}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch cursor positions');
    }

    const data = await response.json();
    return data.cursors;
  }

  // Throttled cursor update to prevent spam
  private static lastUpdate = 0;
  private static updateThrottle = 50; // 50ms = 20 FPS max

  static throttledUpdateCursor(request: UpdateCursorRequest): Promise<CursorPosition> | null {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateThrottle) {
      return null; // Skip this update
    }
    
    this.lastUpdate = now;
    return this.updateCursor(request);
  }
}