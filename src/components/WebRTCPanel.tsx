import React, { useState, useEffect, useRef } from 'react';
import { Monitor, MonitorOff, Video, VideoOff, Mic, MicOff, MessageSquare, X, Users, Share2, Download, Loader2, AlertCircle, Info, Maximize2, Minimize2, Shield, CheckCircle } from 'lucide-react';
import { WebRTCService } from '../services/webrtcService';
import { AudioNotificationService } from '../services/audioNotificationService';
import { WebRTCSignalingManager, subscribeToWebRTCEvents } from '../lib/realtimeWebRTC';
import { ParticipantAvatar } from './ParticipantAvatar';

interface WebRTCPanelProps {
  roomId: string;
  userId: string;
  isOpen: boolean;
  onToggle: () => void;
}

interface ScreenShareSession {
  sessionId: string;
  hostUserId: string;
  hostName: string;
  userColor: string;
  startedAt: number;
  stream?: MediaStream;
}

interface RecordingPermissionRequest {
  id: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  participants: Array<{
    userId: string;
    displayName: string;
    hasResponded: boolean;
    granted?: boolean;
  }>;
}

export default function WebRTCPanel({ roomId, userId, isOpen, onToggle }: WebRTCPanelProps) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [currentScreenShareSessionId, setCurrentScreenShareSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingRequestPending, setIsRecordingRequestPending] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [pendingRecordingRequest, setPendingRecordingRequest] = useState<any>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [comments, setComments] = useState<any[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string>('');
  const [recordingError, setRecordingError] = useState<string>('');
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('idle');
  
  // Enhanced screen sharing state
  const [activeScreenShares, setActiveScreenShares] = useState<Map<string, ScreenShareSession>>(new Map());
  const [mostRecentScreenShare, setMostRecentScreenShare] = useState<string | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const signalingManagerRef = useRef<WebRTCSignalingManager | null>(null);
  const recordingStartTime = useRef<number>(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamEndedHandlerRef = useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;
  const isUserStoppedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    // Test audio capabilities
    AudioNotificationService.testAudio().then(canPlayAudio => {
      console.log('🔊 Audio capabilities:', canPlayAudio ? 'Available' : 'Limited');
    });

    // Initialize signaling manager
    signalingManagerRef.current = new WebRTCSignalingManager(roomId, userId);
    
    signalingManagerRef.current.setOnRemoteStream((stream, fromUserId) => {
      setRemoteStreams(prev => new Map(prev.set(fromUserId, stream)));
      
      // Update screen share session with stream
      setActiveScreenShares(prev => {
        const updated = new Map(prev);
        const session = updated.get(fromUserId);
        if (session) {
          updated.set(fromUserId, { ...session, stream });
        }
        return updated;
      });
    });

    // Start signal polling
    const stopPolling = signalingManagerRef.current.startSignalPolling();

    // Subscribe to WebRTC events
    const channel = subscribeToWebRTCEvents(roomId, {
      onScreenShareStarted: (session) => {
        console.log('🖥️ Screen share started:', session);
        
        // Play sound notification for screen sharing
        if (session.hostUserId !== userId) {
          // Someone else started sharing - play notification sound
          AudioNotificationService.playFirstTimeScreenShareSound();
        }
        
        // Get participant info for the session
        const getParticipantInfo = async () => {
          try {
            // In a real app, you'd fetch this from your participant service
            // For now, we'll use placeholder data
            const newSession: ScreenShareSession = {
              sessionId: session.id,
              hostUserId: session.hostUserId,
              hostName: session.metadata?.hostName || 'Unknown User',
              userColor: '#4ECDC4', // Default color, should come from participant data
              startedAt: Date.now()
            };

            setActiveScreenShares(prev => {
              const updated = new Map(prev);
              updated.set(session.hostUserId, newSession);
              return updated;
            });

            // Set as most recent if it's not the current user
            if (session.hostUserId !== userId) {
              setMostRecentScreenShare(session.hostUserId);
            } else {
              setIsScreenSharing(true);
              setCurrentScreenShareSessionId(session.id);
              setConnectionStatus('connected');
            }
          } catch (error) {
            console.error('Failed to get participant info:', error);
          }
        };

        getParticipantInfo();
      },
      onScreenShareStopped: (sessionId) => {
        console.log('🖥️ Screen share stopped:', sessionId);
        
        // Play stop sound notification
        AudioNotificationService.playScreenShareStopSound();
        
        // Find and remove the session
        setActiveScreenShares(prev => {
          const updated = new Map(prev);
          let removedUserId: string | null = null;
          
          for (const [userId, session] of updated.entries()) {
            if (session.sessionId === sessionId) {
              updated.delete(userId);
              removedUserId = userId;
              break;
            }
          }
          
          // Update most recent if the removed session was the most recent
          if (removedUserId === mostRecentScreenShare) {
            // Find the next most recent session
            let nextMostRecent: string | null = null;
            let latestTime = 0;
            
            for (const [userId, session] of updated.entries()) {
              if (session.startedAt > latestTime) {
                latestTime = session.startedAt;
                nextMostRecent = userId;
              }
            }
            
            setMostRecentScreenShare(nextMostRecent);
          }
          
          return updated;
        });

        // Clean up local state if it was our session
        if (sessionId === currentScreenShareSessionId) {
          setCurrentScreenShareSessionId(null);
          setIsScreenSharing(false);
          setIsMicMuted(false);
          setConnectionStatus('idle');
        }
      },
      onRecordingRequested: (session) => {
        if (session.startedBy !== userId) {
          setPendingRecordingRequest(session);
        }
        setIsRecordingRequestPending(false);
      },
      onRecordingStarted: (sessionId) => {
        console.log('🎬 Recording started:', sessionId);
        setIsRecording(true);
        setRecordingSessionId(sessionId);
        recordingStartTime.current = Date.now();
        setPendingRecordingRequest(null);
        setIsRecordingRequestPending(false);
      },
      onRecordingStopped: (sessionId) => {
        console.log('🎬 Recording stopped:', sessionId);
        setIsRecording(false);
        setRecordingSessionId(null);
        recordingStartTime.current = 0;
        setIsRecordingRequestPending(false);
      },
      onCommentAdded: (comment) => {
        setComments(prev => [...prev, comment]);
      }
    });

    return () => {
      stopPolling();
      channel.unsubscribe();
      if (signalingManagerRef.current) {
        signalingManagerRef.current.stopScreenShare();
      }
      // Clean up local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setCurrentScreenShareSessionId(null);
      setIsScreenSharing(false);
      setIsMicMuted(false);
      setActiveScreenShares(new Map());
      setMostRecentScreenShare(null);
      setConnectionStatus('idle');
    };
  }, [isOpen, roomId, userId, currentScreenShareSessionId, mostRecentScreenShare]);

  // Keyboard shortcut for mute toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'm' && isScreenSharing) {
        event.preventDefault();
        toggleMicrophone();
      }
    };

    if (isScreenSharing) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isScreenSharing, isMicMuted]);

  // Get the current user's screen share session
  const currentUserScreenShare = activeScreenShares.get(userId);
  
  // Get the most recent screen share session for glow effect
  const mostRecentSession = mostRecentScreenShare ? activeScreenShares.get(mostRecentScreenShare) : null;

  const setupStreamEndedHandler = (stream: MediaStream) => {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const handleEnded = () => {
        console.log('🖥️ Video track ended - checking if user manually stopped');
        
        // Only attempt reconnection if user didn't manually stop sharing
        if (!isUserStoppedRef.current && isScreenSharing && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`🖥️ Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
          
          setConnectionStatus('reconnecting');
          
          reconnectTimeoutRef.current = setTimeout(() => {
            handleReconnectScreenShare();
          }, 2000 * reconnectAttemptsRef.current); // Exponential backoff
        } else if (isUserStoppedRef.current) {
          console.log('🖥️ User manually stopped sharing, not reconnecting');
        } else {
          console.log('🖥️ Max reconnection attempts reached');
          setConnectionStatus('failed');
          handleStopScreenShare();
        }
      };

      videoTrack.addEventListener('ended', handleEnded);
      streamEndedHandlerRef.current = () => {
        videoTrack.removeEventListener('ended', handleEnded);
      };
    }
  };

  const handleReconnectScreenShare = async () => {
    try {
      console.log('🖥️ Attempting to reconnect screen share...');
      setScreenShareError('');
      setConnectionStatus('connecting');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
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

      // Replace the stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      localStreamRef.current = stream;
      
      // Update video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }

      // Update signaling
      if (signalingManagerRef.current) {
        signalingManagerRef.current.setLocalStream(stream);
      }

      // Set up new ended handler
      setupStreamEndedHandler(stream);
      
      // Reset reconnect attempts on successful reconnection
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('connected');
      
      console.log('✅ Screen share reconnected successfully');
    } catch (error) {
      console.error('❌ Screen share reconnection failed:', error);
      setConnectionStatus('failed');
      
      // If user denied permission during reconnection, stop sharing
      if (error instanceof Error && error.name === 'NotAllowedError') {
        handleStopScreenShare();
      } else {
        // Try again if we haven't reached max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setTimeout(() => {
            handleReconnectScreenShare();
          }, 5000);
        } else {
          handleStopScreenShare();
        }
      }
    }
  };

  const toggleMicrophone = () => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const newMutedState = !isMicMuted;
      audioTracks.forEach(track => {
        track.enabled = !newMutedState;
      });
      setIsMicMuted(newMutedState);
      
      console.log(`🎤 Microphone ${newMutedState ? 'muted' : 'unmuted'}`);
    }
  };

  // ENHANCED SCREEN SHARING with proper persistence
  const handleStartScreenShare = async () => {
    // Prevent multiple simultaneous attempts
    if (isStartingScreenShare) {
      console.log('🖥️ Screen share already starting, ignoring duplicate request');
      return;
    }

    try {
      setIsStartingScreenShare(true);
      setConnectionStatus('connecting');
      setScreenShareError('');
      setShowPermissionHelp(false);
      reconnectAttemptsRef.current = 0;
      isUserStoppedRef.current = false; // Reset user stop flag
      
      console.log('🖥️ Starting screen share...');
      
      // Use enhanced constraints for better quality and audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
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

      console.log('🖥️ Screen share stream obtained:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        id: stream.id
      });

      // Store the stream reference
      localStreamRef.current = stream;
      
      // Set up video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        try {
          await localVideoRef.current.play();
          console.log('🖥️ Local video element playing');
        } catch (playError) {
          console.warn('Video play failed:', playError);
        }
      }

      // Set up signaling
      if (signalingManagerRef.current) {
        signalingManagerRef.current.setLocalStream(stream);
      }

      // Play sound notification
      AudioNotificationService.playFirstTimeScreenShareSound();

      // Set up persistent stream management - CRITICAL FIX
      setupStreamEndedHandler(stream);

      // Register with backend
      try {
        const result = await WebRTCService.startScreenShare(roomId, userId, {
          resolution: '1920x1080',
          frameRate: 30,
          hasAudio: stream.getAudioTracks().length > 0,
          mediaSource: 'screen'
        });

        if (result && result.sessionId) {
          setCurrentScreenShareSessionId(result.sessionId);
          console.log('🖥️ Screen share session registered:', result.sessionId);
        }
      } catch (backendError) {
        console.warn('Backend registration failed, continuing with local stream:', backendError);
      }

      setIsScreenSharing(true);
      setIsMicMuted(stream.getAudioTracks().length === 0); // Muted if no audio track
      setConnectionStatus('connected');

      console.log('✅ Screen sharing started successfully');

    } catch (error) {
      console.error('❌ Screen share failed:', error);
      
      let errorMessage = 'Failed to start screen sharing.';
      let showHelp = false;
      
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Screen sharing permission denied. Please click "Allow" when prompted.';
            showHelp = true;
            break;
          case 'NotSupportedError':
            errorMessage = 'Screen sharing is not supported in this browser.';
            break;
          case 'NotFoundError':
            errorMessage = 'No screen available to share.';
            break;
          case 'AbortError':
            errorMessage = 'Screen sharing was cancelled.';
            break;
          case 'NotReadableError':
            errorMessage = 'Unable to access screen capture.';
            showHelp = true;
            break;
          default:
            errorMessage = `Screen sharing failed: ${error.message}`;
        }
      }
      
      setScreenShareError(errorMessage);
      setShowPermissionHelp(showHelp);
      setConnectionStatus('failed');
    } finally {
      setIsStartingScreenShare(false);
    }
  };

  const handleStopScreenShare = async () => {
    try {
      console.log('🛑 Stopping screen share...');
      
      // Set user stopped flag to prevent reconnection attempts
      isUserStoppedRef.current = true;
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Remove stream ended handler
      if (streamEndedHandlerRef.current) {
        streamEndedHandlerRef.current();
        streamEndedHandlerRef.current = null;
      }
      
      // Play stop sound notification
      AudioNotificationService.playScreenShareStopSound();
      
      // Stop local stream first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 Stopped ${track.kind} track`);
        });
        localStreamRef.current = null;
      }

      // Clear video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      // Stop signaling
      if (signalingManagerRef.current) {
        signalingManagerRef.current.stopScreenShare();
      }

      // Notify backend
      if (currentScreenShareSessionId) {
        try {
          await WebRTCService.stopScreenShare(roomId, userId);
          console.log('🖥️ Backend notified of screen share stop');
        } catch (backendError) {
          console.warn('Backend stop notification failed:', backendError);
        }
      }

    } catch (error) {
      console.error('❌ Failed to stop screen share:', error);
    } finally {
      // Always reset state
      setCurrentScreenShareSessionId(null);
      setIsScreenSharing(false);
      setIsMicMuted(false);
      setScreenShareError('');
      setShowPermissionHelp(false);
      setIsStartingScreenShare(false);
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('idle');
      isUserStoppedRef.current = false;
    }
  };

  const handleToggleRecording = async () => {
    if (isRecordingRequestPending) return;
    
    if (isRecording) {
      await handleStopRecording();
    } else {
      await handleStartRecording();
    }
  };

  const handleStartRecording = async () => {
    try {
      setIsRecordingRequestPending(true);
      console.log('🎬 Requesting recording permission...');
      
      const result = await WebRTCService.requestRecording(roomId, userId);
      console.log('🎬 Recording permission requested:', result);
      
      // The recording will start automatically when all participants grant permission
      // The state will be updated via the real-time subscription
    } catch (error) {
      console.error('Failed to request recording:', error);
      
      // Check if the error indicates a recording is already in progress
      if (error instanceof Error && error.message.includes('Recording already in progress or pending permission')) {
        // Sync client state with server state - there's already a recording session
        setIsRecording(true);
        alert('A recording session is already active in this room.');
      } else {
        alert('Failed to request recording permission.');
      }
      setIsRecordingRequestPending(false);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingSessionId) {
      console.warn('🎬 No recording session ID available to stop');
      setIsRecording(false);
      setRecordingSessionId(null);
      return;
    }

    try {
      setIsRecordingRequestPending(true);
      console.log('🎬 Stopping recording session:', recordingSessionId);
      
      const duration = Math.floor((Date.now() - recordingStartTime.current) / 1000);
      
      await WebRTCService.stopRecording(
        recordingSessionId,
        userId,
        undefined, // fileUrl would be provided by actual recording implementation
        undefined, // fileSize
        duration
      );
      
      console.log('🎬 Recording stopped successfully');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      alert('Failed to stop recording. The recording may have already ended.');
    } finally {
      // Always reset the state
      setIsRecording(false);
      setRecordingSessionId(null);
      recordingStartTime.current = 0;
      setIsRecordingRequestPending(false);
    }
  };

  const handleRecordingPermission = async (granted: boolean) => {
    if (!pendingRecordingRequest) return;

    try {
      await WebRTCService.grantRecordingPermission(
        pendingRecordingRequest.id,
        userId,
        granted
      );
      
      if (!granted) {
        setPendingRecordingRequest(null);
      }
    } catch (error) {
      console.error('Failed to respond to recording permission:', error);
    }
  };

  const handleAddComment = async (x: number, y: number) => {
    const content = prompt('Add a comment:');
    if (!content) return;

    try {
      await WebRTCService.addComment(roomId, userId, content, x, y);
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-blue-600';
      case 'reconnecting': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return `Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`;
      case 'failed': return 'Connection Failed';
      default: return 'Ready';
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-96 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-colors z-50"
        title="WebRTC Controls"
      >
        <Video className="w-6 h-6" />
        {(isScreenSharing || isRecording) && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-96 w-80 bg-white rounded-xl shadow-2xl border flex flex-col z-50 max-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-green-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-gray-900">WebRTC</h3>
          {isRecording && (
            <div className="flex items-center gap-1 text-red-600">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium">REC</span>
            </div>
          )}
          {activeScreenShares.size > 0 && (
            <div className="flex items-center gap-1 text-blue-600">
              <Monitor className="w-3 h-3" />
              <span className="text-xs font-medium">{activeScreenShares.size} sharing</span>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Enhanced Screen Share Status Indicator */}
      {isScreenSharing && (
        <div className="p-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
                connectionStatus === 'failed' ? 'bg-red-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium text-blue-800">You are sharing your screen</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-xs ${getConnectionStatusColor()}`}>
                {getConnectionStatusText()}
              </span>
            </div>
          </div>
          {connectionStatus === 'reconnecting' && (
            <div className="mt-2 text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
              Attempting to restore connection...
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {(screenShareError || recordingError) && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-red-800 font-medium">
                {screenShareError || recordingError}
              </div>
              {showPermissionHelp && (
                <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800">
                      <p className="font-medium mb-1">Troubleshooting:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Make sure you're using HTTPS (required for screen sharing)</li>
                        <li>Try refreshing the page and allowing permissions</li>
                        <li>Check if other applications are using screen capture</li>
                        <li>Try sharing a specific window instead of entire screen</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  setScreenShareError('');
                  setRecordingError('');
                  setShowPermissionHelp(false);
                }}
                className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recording Permission Request */}
      {pendingRecordingRequest && (
        <div className="p-4 bg-yellow-50 border-b border-yellow-200">
          <div className="text-sm font-medium text-yellow-800 mb-2">
            Recording Permission Request
          </div>
          <div className="text-xs text-yellow-700 mb-3">
            The host wants to record this session. Do you consent?
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleRecordingPermission(true)}
              className="flex-1 bg-green-500 text-white py-2 px-3 rounded text-sm hover:bg-green-600"
            >
              Allow
            </button>
            <button
              onClick={() => handleRecordingPermission(false)}
              className="flex-1 bg-red-500 text-white py-2 px-3 rounded text-sm hover:bg-red-600"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Controls with Microphone */}
      <div className="p-4 border-b">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={isScreenSharing ? handleStopScreenShare : handleStartScreenShare}
            disabled={isStartingScreenShare}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isScreenSharing
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isStartingScreenShare ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isScreenSharing ? (
              <MonitorOff className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
            <span className="text-sm">
              {isStartingScreenShare 
                ? 'Starting...' 
                : isScreenSharing 
                ? 'Stop Share' 
                : 'Share Screen'}
            </span>
          </button>

          <button
            onClick={handleToggleRecording}
            disabled={isRecordingRequestPending || pendingRecordingRequest !== null}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600'
                : isRecordingRequestPending || pendingRecordingRequest !== null
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            <div className={`w-4 h-4 ${isRecording ? 'bg-white' : 'bg-red-500'} rounded-full`} />
            <span className="text-sm">
              {isRecording ? 'Stop Rec' : isRecordingRequestPending ? 'Pending...' : 'Record'}
            </span>
          </button>
        </div>

        {/* Microphone Controls (only show when screen sharing) */}
        {isScreenSharing && (
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <button
              onClick={toggleMicrophone}
              className={`flex items-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                isMicMuted
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
              title={`${isMicMuted ? 'Unmute' : 'Mute'} microphone (Ctrl/Cmd + M)`}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="text-sm">{isMicMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <div className="flex-1 text-xs text-gray-600">
              <div>Audio: {isMicMuted ? 'Muted' : 'Active'}</div>
              <div className="text-gray-500">Press Ctrl/Cmd + M to toggle</div>
            </div>
          </div>
        )}
      </div>

      {/* Local Video */}
      {isScreenSharing && (
        <div className="p-4 border-b">
          <div className="text-sm font-medium text-gray-900 mb-2">Your Screen Share</div>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-32 bg-gray-900 rounded-lg object-contain"
          />
          <div className="mt-2 text-xs text-gray-600 flex items-center justify-between">
            <span>Status: {connectionStatus === 'connected' ? '🟢 Active' : connectionStatus === 'reconnecting' ? '🟡 Reconnecting' : '🔴 Stopped'}</span>
            <span>Audio: {isMicMuted ? '🔇 Muted' : '🔊 Active'}</span>
          </div>
          {reconnectAttemptsRef.current > 0 && connectionStatus === 'connected' && (
            <div className="mt-1 text-xs text-green-600">
              ↻ Reconnected successfully
            </div>
          )}
        </div>
      )}

      {/* Remote Streams */}
      {remoteStreams.size > 0 && (
        <div className="p-4 border-b">
          <div className="text-sm font-medium text-gray-900 mb-2">Remote Streams</div>
          <div className="space-y-2">
            {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
              <div key={userId} className="relative">
                <video
                  autoPlay
                  playsInline
                  className="w-full h-32 bg-gray-900 rounded-lg object-contain"
                  ref={(video) => {
                    if (video) video.srcObject = stream;
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                  User {userId.slice(0, 8)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments Toggle */}
      <div className="p-4">
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <MessageSquare className="w-4 h-4" />
          Comments ({comments.length})
        </button>
      </div>

      {/* Comments List */}
      {showComments && (
        <div className="flex-1 overflow-y-auto p-4 pt-0 max-h-40">
          {comments.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">
              No comments yet. Click anywhere to add one.
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <ParticipantAvatar
                      displayName={comment.user.displayName}
                      userColor={comment.user.userColor}
                      size="sm"
                      showStatus={false}
                    />
                    <span className="text-xs font-medium">{comment.user.displayName}</span>
                  </div>
                  <p className="text-sm text-gray-700">{comment.content}</p>
                  <div className="text-xs text-gray-500 mt-1">
                    Position: ({comment.position.x}, {comment.position.y})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enhanced Instructions */}
      <div className="p-4 bg-gray-50 rounded-b-xl border-t">
        <div className="text-xs text-gray-600">
          <p className="font-medium mb-1">🖥️ Enhanced Screen Sharing:</p>
          <ul className="space-y-1">
            <li>• <strong>Persistent connection</strong> - auto-reconnects if stream drops</li>
            <li>• <strong>Microphone control</strong> - toggle with button or Ctrl/Cmd+M</li>
            <li>• High-quality video (1080p@30fps) with audio</li>
            <li>• Smart error handling and recovery</li>
            <li>• Recording requires permission from all participants</li>
          </ul>
        </div>
      </div>
    </div>
  );
}