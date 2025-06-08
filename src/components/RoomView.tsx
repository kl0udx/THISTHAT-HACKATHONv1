import React, { useEffect, useState } from 'react';
import { Copy, Users, Clock, Share2, LogOut, Loader2, MousePointer, Files, Video, MessageSquare } from 'lucide-react';
import { ParticipantAvatar } from './ParticipantAvatar';
import { ChatPanel } from './ChatPanel';
import { ChatTestPanel } from './ChatTestPanel';
import { DebugPanel } from './DebugPanel';
import { CursorOverlay } from './CursorOverlay';
import { FilePanel } from './FilePanel';
import { CommentingSystem } from './CommentingSystem';
import WebRTCPanel from './WebRTCPanel';
import { RoomService } from '../services/roomService';
import { CursorService, CursorPosition } from '../services/cursorService';
import { subscribeToRoomParticipants } from '../lib/supabase';
import { subscribeToCursorUpdates, CursorTracker } from '../lib/realtimeCursor';
import { RoomDetailsResponse } from '../types/room';

interface RoomViewProps {
  roomCode: string;
  userId: string;
  onLeaveRoom: () => void;
}

export function RoomView({ roomCode, userId, onLeaveRoom }: RoomViewProps) {
  const [roomDetails, setRoomDetails] = useState<RoomDetailsResponse | null>(null);
  const [cursors, setCursors] = useState<CursorPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false);
  const [isWebRTCPanelOpen, setIsWebRTCPanelOpen] = useState(false);
  const [isCommentingEnabled, setIsCommentingEnabled] = useState(false);
  const [cursorTracker, setCursorTracker] = useState<CursorTracker | null>(null);
  const [isCursorTrackingEnabled, setIsCursorTrackingEnabled] = useState(false);

  useEffect(() => {
    loadRoomDetails();
  }, [roomCode]);

  useEffect(() => {
    if (!roomDetails?.room.id) return;

    console.log('Setting up participant subscription for room:', roomDetails.room.id);

    const channel = subscribeToRoomParticipants(roomDetails.room.id, (payload) => {
      console.log('Participant update received:', payload);
      
      // Reload room details when participants change
      loadRoomDetails();
    });

    return () => {
      console.log('Unsubscribing from participant updates');
      channel.unsubscribe();
    };
  }, [roomDetails?.room.id]);

  // Set up cursor tracking
  useEffect(() => {
    if (!roomDetails?.room.id) return;

    // Initialize cursor tracker
    const tracker = new CursorTracker(roomDetails.room.id, userId);
    setCursorTracker(tracker);

    // Load initial cursor positions
    loadCursors();

    // Subscribe to cursor updates
    const cursorChannel = subscribeToCursorUpdates(
      roomDetails.room.id,
      (cursorUpdate) => {
        setCursors(prev => {
          const filtered = prev.filter(c => c.userId !== cursorUpdate.userId);
          return [...filtered, cursorUpdate];
        });
      },
      userId
    );

    return () => {
      tracker.stopTracking();
      cursorChannel.unsubscribe();
    };
  }, [roomDetails?.room.id, userId]);

  const loadRoomDetails = async () => {
    try {
      console.log('Loading room details for:', roomCode);
      const details = await RoomService.getRoomDetails(roomCode);
      console.log('Room details loaded:', details);
      setRoomDetails(details);
      setError('');
    } catch (err) {
      console.error('Failed to load room details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load room details');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCursors = async () => {
    if (!roomDetails?.room.id) return;
    
    try {
      const cursorPositions = await CursorService.getCursors(roomDetails.room.id);
      setCursors(cursorPositions);
    } catch (error) {
      console.error('Failed to load cursor positions:', error);
    }
  };

  const toggleCursorTracking = () => {
    if (!cursorTracker) return;

    if (isCursorTrackingEnabled) {
      cursorTracker.stopTracking();
      setIsCursorTrackingEnabled(false);
    } else {
      cursorTracker.startTracking();
      setIsCursorTrackingEnabled(true);
    }
  };

  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (err) {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const handleShareRoom = async () => {
    const shareData = {
      title: 'Join my collaboration room',
      text: `Join my room with code: ${roomCode}`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        handleCopyRoomCode();
      }
    } else {
      handleCopyRoomCode();
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await RoomService.leaveRoom(userId);
      onLeaveRoom();
    } catch (err) {
      console.error('Failed to leave room:', err);
      onLeaveRoom(); // Leave anyway
    }
  };

  const getTimeRemaining = () => {
    if (!roomDetails?.room.expiresAt) return '';
    
    const now = new Date();
    const expires = new Date(roomDetails.room.expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-500" />
          <p className="text-gray-600">Loading room details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-red-500 mb-4">
            <Users className="w-12 h-12 mx-auto" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Room Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={onLeaveRoom}
            className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomDetails) return null;

  const currentUser = roomDetails.participants.find(p => p.userId === userId);
  const isHost = currentUser?.isHost || false;
  const activeCursors = cursors.filter(c => c.isOnline && c.userId !== userId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Room {roomCode}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{roomDetails.participants.length}/8 participants</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{getTimeRemaining()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MousePointer className="w-4 h-4" />
                  <span>{activeCursors.length} active cursors</span>
                </div>
                <div className="flex items-center gap-1">
                  <Files className="w-4 h-4" />
                  <span>File sharing enabled</span>
                </div>
                <div className="flex items-center gap-1">
                  <Video className="w-4 h-4" />
                  <span>WebRTC optimized</span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  <span>Comments {isCommentingEnabled ? 'active' : 'available'}</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={toggleCursorTracking}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isCursorTrackingEnabled
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <MousePointer className="w-4 h-4" />
                {isCursorTrackingEnabled ? 'Tracking On' : 'Enable Tracking'}
              </button>
              
              <button
                onClick={handleCopyRoomCode}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copyFeedback || 'Copy Code'}
              </button>
              
              <button
                onClick={handleShareRoom}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              
              <button
                onClick={handleLeaveRoom}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Leave
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Testing Instructions */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">🧪 Enhanced Real-time Collaboration Platform</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
            <div>
              <h3 className="font-medium mb-2">Multi-Tab Testing:</h3>
              <ul className="space-y-1">
                <li>• Copy this URL: <code className="bg-white px-1 rounded text-xs break-all">{window.location.href}</code></li>
                <li>• Open it in a new tab or incognito window</li>
                <li>• Join the same room code: <strong className="text-blue-600">{roomCode}</strong></li>
                <li>• Enable cursor tracking in both tabs</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Real-time Features:</h3>
              <ul className="space-y-1">
                <li>• Chat messages sync instantly</li>
                <li>• Typing indicators show immediately</li>
                <li>• Mouse cursors appear as colored pointers</li>
                <li>• File uploads appear instantly for all users</li>
                <li>• Screen sharing with WebRTC</li>
                <li>• Session recording with consent</li>
                <li>• <strong>💬 Figma-style comments with pins!</strong></li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Debug Tools:</h3>
              <ul className="space-y-1">
                <li>• Click the debug button (🐛) to see real-time logs</li>
                <li>• Green button for chat testing tools</li>
                <li>• Blue button to open chat panel</li>
                <li>• Purple button to open file sharing panel</li>
                <li>• Green video button for WebRTC controls</li>
                <li>• <strong>🟣 Indigo button for Figma-style commenting!</strong></li>
                <li>• Look for "SUBSCRIBED" status in debug console</li>
              </ul>
            </div>
          </div>
          
          {/* WebRTC Optimization Notice */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">🚀 WebRTC Performance Optimization</h4>
            <p className="text-blue-800 text-sm">
              This room is optimized for <strong>8 participants maximum</strong> to ensure the best WebRTC experience with:
              high-quality video/audio, stable connections, smooth screen sharing, and low latency for real-time collaboration.
            </p>
          </div>
        </div>

        {/* Current User */}
        {currentUser && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">You</h2>
            <div className="flex items-center gap-4">
              <ParticipantAvatar
                displayName={currentUser.displayName}
                userColor={currentUser.userColor}
                isHost={currentUser.isHost}
                size="lg"
                showStatus={false}
              />
              <div>
                <p className="font-medium text-gray-900">{currentUser.displayName}</p>
                <p className="text-sm text-gray-600">
                  {currentUser.isHost ? 'Room Host' : 'Participant'}
                </p>
                <p className="text-xs text-gray-500">
                  Cursor tracking: {isCursorTrackingEnabled ? '✅ Enabled' : '❌ Disabled'}
                </p>
                <p className="text-xs text-gray-500">
                  Commenting: {isCommentingEnabled ? '✅ Active' : '❌ Inactive'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Other Participants */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Other Participants ({roomDetails.participants.filter(p => p.userId !== userId).length}/7)
          </h2>
          
          {roomDetails.participants.filter(p => p.userId !== userId).length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No other participants yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Open a new tab and join with code: <strong className="text-blue-600">{roomCode}</strong>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Room capacity: {roomDetails.participants.length}/8 (WebRTC optimized)
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roomDetails.participants
                .filter(p => p.userId !== userId)
                .map(participant => {
                  const participantCursor = cursors.find(c => c.userId === participant.userId);
                  return (
                    <div
                      key={participant.userId}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all animate-fade-in ${
                        participant.isOnline
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <ParticipantAvatar
                        displayName={participant.displayName}
                        userColor={participant.userColor}
                        isHost={participant.isHost}
                        isOnline={participant.isOnline}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {participant.displayName}
                        </p>
                        <p className="text-sm text-gray-600">
                          {participant.isHost ? 'Host' : 'Participant'} • {participant.isOnline ? 'Online' : 'Offline'}
                        </p>
                        {participantCursor && (
                          <p className="text-xs text-gray-500">
                            🖱️ Cursor: ({participantCursor.x}, {participantCursor.y})
                            {participantCursor.platform && ` • ${participantCursor.platform}`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Cursor Overlay */}
      <CursorOverlay cursors={cursors} currentUserId={userId} />

      {/* Debug Panel */}
      <DebugPanel roomId={roomDetails.room.id} userId={userId} />

      {/* Chat Panel */}
      <ChatPanel
        roomId={roomDetails.room.id}
        userId={userId}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />

      {/* File Panel */}
      <FilePanel
        roomId={roomDetails.room.id}
        userId={userId}
        isOpen={isFilesPanelOpen}
        onToggle={() => setIsFilesPanelOpen(!isFilesPanelOpen)}
      />

      {/* WebRTC Panel */}
      <WebRTCPanel
        roomId={roomDetails.room.id}
        userId={userId}
        isOpen={isWebRTCPanelOpen}
        onToggle={() => setIsWebRTCPanelOpen(!isWebRTCPanelOpen)}
      />

      {/* Figma-style Commenting System */}
      <CommentingSystem
        roomId={roomDetails.room.id}
        userId={userId}
        isEnabled={isCommentingEnabled}
        onToggle={() => setIsCommentingEnabled(!isCommentingEnabled)}
      />

      {/* Chat Test Panel */}
      <ChatTestPanel
        roomId={roomDetails.room.id}
        currentUserId={userId}
      />
    </div>
  );
}