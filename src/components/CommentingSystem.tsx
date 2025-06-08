import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Check, Trash2, Send, Move } from 'lucide-react';
import { WebRTCService, Comment } from '../services/webrtcService';
import { subscribeToWebRTCEvents } from '../lib/realtimeWebRTC';
import { ParticipantAvatar } from './ParticipantAvatar';
import { formatMessageTime } from '../utils/timeUtils';
import { getInitials } from '../utils/userUtils';

interface CommentingSystemProps {
  roomId: string;
  userId: string;
  isEnabled: boolean;
  onToggle: () => void;
}

interface PinnedComment extends Comment {
  isPinned: boolean;
  pinPosition: { x: number; y: number };
  isDragging?: boolean;
}

export function CommentingSystem({ roomId, userId, isEnabled, onToggle }: CommentingSystemProps) {
  const [comments, setComments] = useState<PinnedComment[]>([]);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newCommentPosition, setNewCommentPosition] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ displayName: string; userColor: string } | null>(null);
  const [dragState, setDragState] = useState<{
    commentId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  
  const commentInputRef = useRef<HTMLInputElement>(null);
  const webrtcChannelRef = useRef<any>(null);

  useEffect(() => {
    if (isEnabled) {
      loadComments();
      loadCurrentUser();
      setupClickListener();
      setupWebRTCSubscription();
    } else {
      removeClickListener();
      cleanupWebRTCSubscription();
    }

    return () => {
      removeClickListener();
      cleanupWebRTCSubscription();
    };
  }, [isEnabled, roomId]);

  const setupWebRTCSubscription = () => {
    console.log('💬 Setting up WebRTC comment subscriptions');
    
    webrtcChannelRef.current = subscribeToWebRTCEvents(roomId, {
      onCommentAdded: (comment) => {
        console.log('💬 Real-time comment added:', comment);
        const pinnedComment: PinnedComment = {
          ...comment,
          isPinned: true,
          pinPosition: comment.position
        };
        setComments(prev => [...prev, pinnedComment]);
      },
      
      onCommentUpdated: (comment) => {
        console.log('💬 Real-time comment updated:', comment);
        setComments(prev => prev.map(c => 
          c.id === comment.id 
            ? { ...c, ...comment, pinPosition: comment.position }
            : c
        ));
      },
      
      onCommentMoved: (commentId, position) => {
        console.log('📍 Real-time comment moved:', commentId, position);
        setComments(prev => prev.map(c => 
          c.id === commentId 
            ? { ...c, pinPosition: position, position }
            : c
        ));
      },
      
      onCommentResolved: (commentId, resolved) => {
        console.log('✅ Real-time comment resolved:', commentId, resolved);
        setComments(prev => prev.map(c => 
          c.id === commentId 
            ? { ...c, resolved, resolvedAt: resolved ? new Date().toISOString() : undefined }
            : c
        ));
      }
    });
  };

  const cleanupWebRTCSubscription = () => {
    if (webrtcChannelRef.current) {
      console.log('🧹 Cleaning up WebRTC comment subscriptions');
      webrtcChannelRef.current.unsubscribe();
      webrtcChannelRef.current = null;
    }
  };

  const loadCurrentUser = async () => {
    // In a real app, you'd fetch this from your user service
    // For now, we'll use a placeholder
    setCurrentUser({
      displayName: 'Current User',
      userColor: '#6366f1' // Indigo color
    });
  };

  const setupClickListener = () => {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const removeClickListener = () => {
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleDocumentClick = (event: MouseEvent) => {
    // Don't add comments if dragging
    if (dragState) return;
    
    // Don't add comments if clicking on existing comments or UI elements
    const target = event.target as HTMLElement;
    if (target.closest('.comment-pin') || 
        target.closest('.comment-popup') || 
        target.closest('.comment-input-container') ||
        target.closest('.webrtc-panel') ||
        target.closest('.fixed') ||
        target.closest('[data-no-comment]')) {
      return;
    }

    // Add comment at click position
    setNewCommentPosition({ x: event.clientX, y: event.clientY });
    setIsAddingComment(true);
    
    // Focus the input after a brief delay
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 100);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!dragState) return;

    const newX = event.clientX - dragState.offsetX;
    const newY = event.clientY - dragState.offsetY;

    // Update comment position optimistically
    setComments(prev => prev.map(c => 
      c.id === dragState.commentId 
        ? { ...c, pinPosition: { x: newX, y: newY }, isDragging: true }
        : c
    ));
  };

  const handleMouseUp = async () => {
    if (!dragState) return;

    const comment = comments.find(c => c.id === dragState.commentId);
    if (comment) {
      try {
        // Update position in database via WebRTC signaling
        await updateCommentPosition(dragState.commentId, comment.pinPosition);
        
        // Clear dragging state
        setComments(prev => prev.map(c => 
          c.id === dragState.commentId 
            ? { ...c, isDragging: false }
            : c
        ));
      } catch (error) {
        console.error('Failed to update comment position:', error);
        // Revert position on error
        loadComments();
      }
    }

    setDragState(null);
  };

  const handlePinMouseDown = (event: React.MouseEvent, commentId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    setDragState({
      commentId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY
    });
  };

  const updateCommentPosition = async (commentId: string, position: { x: number; y: number }) => {
    try {
      // Update position via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-comment-position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          commentId,
          positionX: Math.round(position.x),
          positionY: Math.round(position.y),
          userId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update comment position');
      }

      console.log('📍 Comment position updated successfully');
    } catch (error) {
      console.error('Failed to update comment position:', error);
      throw error;
    }
  };

  const loadComments = async () => {
    try {
      const roomComments = await WebRTCService.getComments(roomId, showResolved);
      const pinnedComments = roomComments.map(comment => ({
        ...comment,
        isPinned: true,
        pinPosition: { x: comment.position.x, y: comment.position.y }
      }));
      setComments(pinnedComments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim() || !newCommentPosition) return;

    try {
      const comment = await WebRTCService.addComment(
        roomId,
        userId,
        newCommentText.trim(),
        newCommentPosition.x,
        newCommentPosition.y,
        window.location.href
      );

      // Don't add locally - will be added via WebRTC subscription
      setNewCommentText('');
      setNewCommentPosition(null);
      setIsAddingComment(false);
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  const handleCancelComment = () => {
    setNewCommentText('');
    setNewCommentPosition(null);
    setIsAddingComment(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    } else if (e.key === 'Escape') {
      handleCancelComment();
    }
  };

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    try {
      await WebRTCService.resolveComment(commentId, userId, resolved);
      // Update will come via WebRTC subscription
    } catch (error) {
      console.error('Failed to resolve comment:', error);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;

    try {
      // Delete via edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-comment`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ commentId, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete comment');
      }

      // Remove locally
      setComments(prev => prev.filter(comment => comment.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const visibleComments = showResolved 
    ? comments 
    : comments.filter(comment => !comment.resolved);

  if (!isEnabled) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 left-24 bg-indigo-500 hover:bg-indigo-600 text-white p-4 rounded-full shadow-lg transition-colors z-50"
        title="Enable Commenting"
      >
        <MessageSquare className="w-6 h-6" />
        {comments.filter(c => !c.resolved).length > 0 && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {comments.filter(c => !c.resolved).length}
          </div>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="fixed bottom-6 left-24 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-colors z-50"
        title="Disable Commenting"
        data-no-comment
      >
        <MessageSquare className="w-6 h-6" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      </button>

      {/* Comments Panel */}
      <div className="fixed top-6 left-6 w-80 bg-white rounded-xl shadow-2xl border z-50 max-h-[60vh] flex flex-col" data-no-comment>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-indigo-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Comments</h3>
            <span className="text-sm text-gray-500">({visibleComments.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResolved(!showResolved)}
              className={`px-2 py-1 text-xs rounded ${
                showResolved ? 'bg-gray-200 text-gray-700' : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {showResolved ? 'Hide Resolved' : 'Show Resolved'}
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4">
          {visibleComments.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No comments yet</p>
              <p className="text-sm mt-1">Click anywhere on the screen to add a comment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleComments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedComment === comment.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : comment.resolved
                      ? 'border-gray-200 bg-gray-50 opacity-75'
                      : 'border-gray-200 bg-white hover:border-indigo-300'
                  }`}
                  onClick={() => setSelectedComment(selectedComment === comment.id ? null : comment.id)}
                >
                  <div className="flex items-start gap-3">
                    <ParticipantAvatar
                      displayName={comment.user.displayName}
                      userColor={comment.user.userColor}
                      size="sm"
                      showStatus={false}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {comment.user.displayName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatMessageTime(comment.createdAt)}
                        </span>
                        {comment.resolved && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 break-words">{comment.content}</p>
                      <div className="text-xs text-gray-500 mt-1">
                        Position: ({Math.round(comment.pinPosition.x)}, {Math.round(comment.pinPosition.y)})
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!comment.resolved && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveComment(comment.id, true);
                          }}
                          className="p-1 hover:bg-green-200 rounded text-green-600 hover:text-green-800"
                          title="Resolve comment"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {comment.resolved && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveComment(comment.id, false);
                          }}
                          className="p-1 hover:bg-indigo-200 rounded text-indigo-600 hover:text-indigo-800"
                          title="Unresolve comment"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteComment(comment.id);
                        }}
                        className="p-1 hover:bg-red-200 rounded text-red-600 hover:text-red-800"
                        title="Delete comment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="p-4 bg-gray-50 rounded-b-xl border-t">
          <div className="text-xs text-gray-600">
            <p className="font-medium mb-1">💬 Enhanced Figma-style Comments:</p>
            <ul className="space-y-1">
              <li>• Click anywhere on screen to add a comment</li>
              <li>• <strong>Drag pins to move them around!</strong></li>
              <li>• Comments sync in real-time via WebRTC</li>
              <li>• Press Enter to submit, Escape to cancel</li>
              <li>• Perfect for design reviews and feedback</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Comment Pins on Screen - Enhanced with drag functionality */}
      {visibleComments.map((comment) => (
        <div
          key={`pin-${comment.id}`}
          className={`comment-pin fixed z-40 cursor-pointer transition-all ${
            comment.isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-105'
          }`}
          style={{
            left: comment.pinPosition.x - 18,
            top: comment.pinPosition.y - 18,
          }}
          onClick={() => setSelectedComment(selectedComment === comment.id ? null : comment.id)}
          onMouseDown={(e) => handlePinMouseDown(e, comment.id)}
        >
          <div
            className={`w-9 h-9 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white text-sm font-bold transition-all ${
              comment.resolved 
                ? 'bg-green-500' 
                : selectedComment === comment.id
                ? 'scale-110 ring-2 ring-white ring-opacity-50'
                : ''
            } ${comment.isDragging ? 'shadow-2xl' : ''}`}
            style={{ 
              backgroundColor: comment.resolved ? '#10b981' : comment.user.userColor,
              boxShadow: comment.isDragging 
                ? '0 8px 25px rgba(0, 0, 0, 0.3)' 
                : '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
          >
            {comment.resolved ? '✓' : getInitials(comment.user.displayName)}
          </div>
          
          {/* Drag indicator */}
          {comment.isDragging && (
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-xs whitespace-nowrap">
              <Move className="w-3 h-3 inline mr-1" />
              Drag to move
            </div>
          )}
          
          {/* Comment popup */}
          {selectedComment === comment.id && !comment.isDragging && (
            <div className="comment-popup absolute top-12 left-0 w-64 bg-white rounded-lg shadow-xl border-2 border-indigo-500 p-3 z-50">
              <div className="flex items-start gap-2 mb-2">
                <ParticipantAvatar
                  displayName={comment.user.displayName}
                  userColor={comment.user.userColor}
                  size="sm"
                  showStatus={false}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{comment.user.displayName}</span>
                    <span className="text-xs text-gray-500">{formatMessageTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{comment.content}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedComment(null);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              
              <div className="flex items-center gap-2 pt-2 border-t">
                {!comment.resolved ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolveComment(comment.id, true);
                    }}
                    className="flex-1 bg-green-500 text-white py-1 px-2 rounded text-xs hover:bg-green-600"
                  >
                    Resolve
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolveComment(comment.id, false);
                    }}
                    className="flex-1 bg-indigo-500 text-white py-1 px-2 rounded text-xs hover:bg-indigo-600"
                  >
                    Unresolve
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteComment(comment.id);
                  }}
                  className="p-1 hover:bg-red-200 rounded text-red-600"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* New Comment Input - Compact single line that can grow */}
      {isAddingComment && newCommentPosition && (
        <div
          className="comment-input-container fixed z-50"
          style={{
            left: Math.max(10, Math.min(newCommentPosition.x - 200, window.innerWidth - 410)),
            top: Math.max(10, newCommentPosition.y + 20),
          }}
          data-no-comment
        >
          <div className="w-96 bg-white rounded-lg shadow-xl border-2 border-indigo-500 p-3">
            <div className="flex items-center gap-2 mb-2">
              {currentUser && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: currentUser.userColor }}
                >
                  {getInitials(currentUser.displayName)}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900">Add Comment</span>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                ref={commentInputRef}
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your comment and press Enter..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                maxLength={500}
                autoFocus
              />
              <button
                onClick={handleAddComment}
                disabled={!newCommentText.trim()}
                className="p-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Send comment"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelComment}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                Press Enter to send, Escape to cancel
              </span>
              <span className="text-xs text-gray-400">
                {newCommentText.length}/500
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Overlay to indicate commenting mode */}
      <div className="fixed inset-0 pointer-events-none z-30">
        <div className="absolute top-4 right-4 bg-indigo-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm font-medium">Commenting Mode Active</span>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </>
  );
}