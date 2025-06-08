import { supabase } from './supabase';
import { WebRTCSession, Comment, RecordingSession } from '../services/webrtcService';

export function subscribeToWebRTCEvents(roomId: string, callbacks: {
  onScreenShareStarted?: (session: WebRTCSession) => void;
  onScreenShareStopped?: (sessionId: string) => void;
  onCommentAdded?: (comment: Comment) => void;
  onCommentUpdated?: (comment: Comment) => void;
  onCommentMoved?: (commentId: string, position: { x: number; y: number }) => void;
  onCommentResolved?: (commentId: string, resolved: boolean) => void;
  onRecordingRequested?: (session: RecordingSession) => void;
  onRecordingStarted?: (sessionId: string) => void;
  onRecordingStopped?: (sessionId: string, fileUrl?: string) => void;
}) {
  console.log('🎥 Setting up WebRTC event subscriptions for room:', roomId);
  
  const channel = supabase.channel(`webrtc_events_${roomId}`, {
    config: {
      broadcast: { self: false },
      presence: { key: roomId }
    }
  });

  // Screen sharing events
  if (callbacks.onScreenShareStarted) {
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'webrtc_sessions',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.new.session_type === 'screen_share' && payload.new.is_active) {
        console.log('🖥️ Screen share started:', payload.new);
        callbacks.onScreenShareStarted!({
          id: payload.new.id,
          roomId: payload.new.room_id,
          sessionType: payload.new.session_type,
          hostUserId: payload.new.host_user_id,
          startedAt: payload.new.started_at,
          endedAt: payload.new.ended_at,
          isActive: payload.new.is_active,
          metadata: payload.new.metadata
        });
      }
    });
  }

  if (callbacks.onScreenShareStopped) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'webrtc_sessions',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.new.session_type === 'screen_share' && 
          payload.old.is_active && !payload.new.is_active) {
        console.log('🖥️ Screen share stopped:', payload.new.id);
        callbacks.onScreenShareStopped!(payload.new.id);
      }
    });
  }

  // Enhanced comment events with real-time positioning
  if (callbacks.onCommentAdded) {
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `room_id=eq.${roomId}`
    }, async (payload) => {
      console.log('💬 Comment added:', payload.new);
      
      // Fetch participant data separately to avoid foreign key issues
      const { data: participant } = await supabase
        .from('participants')
        .select('display_name, user_color, avatar_emoji')
        .eq('user_id', payload.new.user_id)
        .single();

      if (participant) {
        const comment: Comment = {
          id: payload.new.id,
          content: payload.new.content,
          position: {
            x: payload.new.position_x,
            y: payload.new.position_y
          },
          targetUrl: payload.new.target_url,
          createdAt: payload.new.created_at,
          resolved: payload.new.resolved,
          resolvedAt: payload.new.resolved_at,
          user: {
            userId: payload.new.user_id,
            displayName: participant.display_name,
            userColor: participant.user_color,
            avatarEmoji: participant.avatar_emoji
          }
        };
        
        callbacks.onCommentAdded!(comment);
      }
    });
  }

  // Comment updates (content, resolution status)
  if (callbacks.onCommentUpdated) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'comments',
      filter: `room_id=eq.${roomId}`
    }, async (payload) => {
      // Only process non-position updates
      if (payload.old.position_x === payload.new.position_x && 
          payload.old.position_y === payload.new.position_y) {
        
        console.log('💬 Comment updated:', payload.new.id);
        
        const { data: participant } = await supabase
          .from('participants')
          .select('display_name, user_color, avatar_emoji')
          .eq('user_id', payload.new.user_id)
          .single();

        if (participant) {
          const comment: Comment = {
            id: payload.new.id,
            content: payload.new.content,
            position: {
              x: payload.new.position_x,
              y: payload.new.position_y
            },
            targetUrl: payload.new.target_url,
            createdAt: payload.new.created_at,
            resolved: payload.new.resolved,
            resolvedAt: payload.new.resolved_at,
            user: {
              userId: payload.new.user_id,
              displayName: participant.display_name,
              userColor: participant.user_color,
              avatarEmoji: participant.avatar_emoji
            }
          };
          
          callbacks.onCommentUpdated!(comment);
        }
      }
    });
  }

  // Comment position changes (for dragging pins)
  if (callbacks.onCommentMoved) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'comments',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      // Only process position updates
      if (payload.old.position_x !== payload.new.position_x || 
          payload.old.position_y !== payload.new.position_y) {
        
        console.log('📍 Comment moved:', payload.new.id, 'to', payload.new.position_x, payload.new.position_y);
        
        callbacks.onCommentMoved!(payload.new.id, {
          x: payload.new.position_x,
          y: payload.new.position_y
        });
      }
    });
  }

  // Comment resolution status changes
  if (callbacks.onCommentResolved) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'comments',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.old.resolved !== payload.new.resolved) {
        console.log('💬 Comment resolved status changed:', payload.new.id, payload.new.resolved);
        callbacks.onCommentResolved!(payload.new.id, payload.new.resolved);
      }
    });
  }

  // Recording events
  if (callbacks.onRecordingRequested) {
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'recording_sessions',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.new.status === 'pending_permission') {
        console.log('🎬 Recording permission requested:', payload.new);
        callbacks.onRecordingRequested!({
          id: payload.new.id,
          roomId: payload.new.room_id,
          startedBy: payload.new.started_by,
          startedAt: payload.new.started_at,
          endedAt: payload.new.ended_at,
          durationSeconds: payload.new.duration_seconds,
          fileUrl: payload.new.file_url,
          fileSize: payload.new.file_size,
          status: payload.new.status,
          twitterOptimized: payload.new.twitter_optimized,
          downloadCount: payload.new.download_count,
          metadata: payload.new.metadata
        });
      }
    });
  }

  if (callbacks.onRecordingStarted) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'recording_sessions',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.new.status === 'recording' && payload.old.status !== 'recording') {
        console.log('🎬 Recording started:', payload.new.id);
        callbacks.onRecordingStarted!(payload.new.id);
      }
    });
  }

  if (callbacks.onRecordingStopped) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'recording_sessions',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if ((payload.new.status === 'completed' || payload.new.status === 'failed') && 
          payload.old.status === 'recording') {
        console.log('🎬 Recording stopped:', payload.new.id);
        callbacks.onRecordingStopped!(payload.new.id, payload.new.file_url);
      }
    });
  }

  return channel.subscribe((status) => {
    console.log('🎥 WebRTC events subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('✅ WebRTC events: SUCCESSFULLY SUBSCRIBED');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('❌ WebRTC events: SUBSCRIPTION FAILED');
    }
  });
}

// Enhanced WebRTC Signaling Manager with improved stream management
export class WebRTCSignalingManager {
  private roomId: string;
  private userId: string;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private onRemoteStream?: (stream: MediaStream, userId: string) => void;
  private reconnectAttempts = new Map<string, number>();
  private maxReconnectAttempts = 3;

  constructor(roomId: string, userId: string) {
    this.roomId = roomId;
    this.userId = userId;
  }

  setOnRemoteStream(callback: (stream: MediaStream, userId: string) => void) {
    this.onRemoteStream = callback;
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    console.log('🖥️ Local stream set:', {
      id: stream.id,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    });

    // Replace tracks in existing peer connections
    this.peerConnections.forEach((pc, userId) => {
      this.replaceTracksInConnection(pc, stream);
    });
  }

  private replaceTracksInConnection(pc: RTCPeerConnection, newStream: MediaStream) {
    const senders = pc.getSenders();
    
    // Replace video track
    const videoTrack = newStream.getVideoTracks()[0];
    const videoSender = senders.find(s => s.track?.kind === 'video');
    if (videoSender && videoTrack) {
      videoSender.replaceTrack(videoTrack).catch(console.error);
    } else if (videoTrack) {
      pc.addTrack(videoTrack, newStream);
    }

    // Replace audio track
    const audioTrack = newStream.getAudioTracks()[0];
    const audioSender = senders.find(s => s.track?.kind === 'audio');
    if (audioSender && audioTrack) {
      audioSender.replaceTrack(audioTrack).catch(console.error);
    } else if (audioTrack) {
      pc.addTrack(audioTrack, newStream);
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      // Enhanced screen sharing options with better error handling
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      this.localStream = stream;
      console.log('🖥️ Screen share started locally with enhanced options');
      
      // Set up track ended handlers for persistence
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log(`🖥️ Track ended: ${track.kind}`);
          this.handleTrackEnded(track);
        });
      });

      return stream;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      throw error;
    }
  }

  private handleTrackEnded(track: MediaStreamTrack) {
    console.log('🖥️ Handling track ended, attempting to maintain connections');
    
    // Don't immediately close connections, allow for reconnection
    // The WebRTC panel will handle stream replacement
  }

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🖥️ Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.reconnectAttempts.clear();

    console.log('🖥️ Screen share stopped locally');
  }

  async createOffer(targetUserId: string): Promise<void> {
    if (!this.localStream) {
      throw new Error('No local stream available');
    }

    const pc = this.createPeerConnection(targetUserId);
    this.peerConnections.set(targetUserId, pc);

    // Add local stream
    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream!);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send offer via signaling server
    await this.sendSignal(targetUserId, 'offer', offer);
  }

  async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.createPeerConnection(fromUserId);
    this.peerConnections.set(fromUserId, pc);

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer via signaling server
    await this.sendSignal(fromUserId, 'answer', answer);
  }

  async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }

  async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  private createPeerConnection(userId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('📺 Remote stream received from:', userId);
      this.onRemoteStream?.(event.streams[0], userId);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(userId, 'ice-candidate', event.candidate);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${userId}:`, pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        this.handleConnectionFailure(userId);
      }
    };

    return pc;
  }

  private async handleConnectionFailure(userId: string) {
    const attempts = this.reconnectAttempts.get(userId) || 0;
    
    if (attempts < this.maxReconnectAttempts) {
      console.log(`🔄 Attempting to reconnect to ${userId} (${attempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectAttempts.set(userId, attempts + 1);
      
      // Wait before reconnecting
      setTimeout(() => {
        this.createOffer(userId).catch(console.error);
      }, 2000 * (attempts + 1)); // Exponential backoff
    } else {
      console.log(`❌ Max reconnection attempts reached for ${userId}`);
      this.peerConnections.delete(userId);
      this.reconnectAttempts.delete(userId);
    }
  }

  private async sendSignal(toUserId: string, signalType: string, signalData: any): Promise<void> {
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webrtc-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          roomId: this.roomId,
          fromUserId: this.userId,
          toUserId,
          signalType,
          signalData
        }),
      });
    } catch (error) {
      console.error('Failed to send signal:', error);
    }
  }

  // Poll for incoming signals
  async pollSignals(): Promise<void> {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webrtc-signal?roomId=${this.roomId}&userId=${this.userId}`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        for (const signal of data.signals) {
          switch (signal.signal_type) {
            case 'offer':
              await this.handleOffer(signal.from_peer, signal.signal_data);
              break;
            case 'answer':
              await this.handleAnswer(signal.from_peer, signal.signal_data);
              break;
            case 'ice-candidate':
              await this.handleIceCandidate(signal.from_peer, signal.signal_data);
              break;
          }
        }
      }
    } catch (error) {
      console.error('Failed to poll signals:', error);
    }
  }

  startSignalPolling(intervalMs = 1000): () => void {
    const interval = setInterval(() => {
      this.pollSignals();
    }, intervalMs);

    return () => clearInterval(interval);
  }
}