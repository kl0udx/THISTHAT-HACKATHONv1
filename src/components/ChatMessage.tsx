import React, { useState } from 'react';
import { Reply, MoreVertical, Download, Eye, ExternalLink } from 'lucide-react';
import { ParticipantAvatar } from './ParticipantAvatar';
import { ChatMessage as ChatMessageType } from '../services/chatService';
import { formatMessageTime } from '../utils/timeUtils';
import { ChatService } from '../services/chatService';
import { getFileIcon, formatFileSize, getFileType } from '../utils/fileValidation';

interface ChatMessageProps {
  message: ChatMessageType;
  currentUserId: string;
  onReply?: (message: ChatMessageType) => void;
  onReactionUpdate?: (messageId: string, emoji: string, action: 'added' | 'removed', user: any) => void;
}

const COMMON_REACTIONS = ['👍', '👎', '❤️', '😂', '🔥', '🚀', '🙏', '😮'];

export function ChatMessage({ message, currentUserId, onReply, onReactionUpdate }: ChatMessageProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [isAddingReaction, setIsAddingReaction] = useState(false);

  const isOwn = message.user.userId === currentUserId;

  const handleReaction = async (emoji: string) => {
    try {
      setIsAddingReaction(true);
      
      // Check if user already reacted with this emoji
      const existingReaction = message.reactions[emoji]?.find(r => r.userId === currentUserId);
      const action = existingReaction ? 'removed' : 'added';
      
      // Optimistic update for immediate feedback
      if (onReactionUpdate) {
        onReactionUpdate(message.id, emoji, action, {
          userId: currentUserId,
          displayName: 'You', // Will be updated by real-time subscription
          userColor: '#666666'
        });
      }
      
      const result = await ChatService.addReaction(message.id, currentUserId, emoji);
      console.log('✅ Reaction result:', result);
      
      setShowReactions(false);
    } catch (error) {
      console.error('❌ Failed to add reaction:', error);
      
      // Revert optimistic update on error
      if (onReactionUpdate) {
        const revertAction = existingReaction ? 'added' : 'removed';
        onReactionUpdate(message.id, emoji, revertAction, {
          userId: currentUserId,
          displayName: 'You',
          userColor: '#666666'
        });
      }
    } finally {
      setIsAddingReaction(false);
    }
  };

  const renderFileAttachment = () => {
    if (!message.fileData) return null;

    const { filename, size, mimeType, type, url } = message.fileData;
    const fileIcon = getFileIcon(filename, mimeType);
    const fileSize = formatFileSize(size);
    const fileType = getFileType(filename, mimeType);

    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-lg border max-w-xs">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{fileIcon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate" title={filename}>
              {filename}
            </p>
            <p className="text-xs text-gray-500">
              {fileSize} • {fileType}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {mimeType}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {fileType === 'image' && url && (
              <button
                className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900"
                title="View image"
                onClick={() => window.open(url, '_blank')}
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            {url && (
              <button
                className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900"
                title="Download file"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = filename;
                  link.click();
                }}
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {!url && (
              <div className="p-1 text-gray-400" title="File not available for download">
                <ExternalLink className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>

        {/* File type specific preview */}
        {fileType === 'image' && url && (
          <div className="mt-2">
            <img
              src={url}
              alt={filename}
              className="max-w-full h-auto rounded border cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(url, '_blank')}
              style={{ maxHeight: '200px' }}
            />
          </div>
        )}

        {fileType === 'code' && (
          <div className="mt-2 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
            Code file • Click download to view
          </div>
        )}
      </div>
    );
  };

  const renderReactions = () => {
    const reactions = Object.entries(message.reactions);
    if (reactions.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {reactions.map(([emoji, users]) => {
          const hasUserReacted = users.some(user => user.userId === currentUserId);
          return (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              disabled={isAddingReaction}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                hasUserReacted
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } ${isAddingReaction ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={users.map(u => u.displayName).join(', ')}
            >
              <span>{emoji}</span>
              <span>{users.length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex gap-3 group animate-fade-in ${isOwn ? 'flex-row-reverse' : ''}`}>
      <ParticipantAvatar
        displayName={message.user.displayName}
        userColor={message.user.userColor}
        size="sm"
        showStatus={false}
      />
      
      <div className={`flex-1 max-w-xs sm:max-w-md ${isOwn ? 'text-right' : ''}`}>
        <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-900">
            {message.user.displayName}
          </span>
          <span className="text-xs text-gray-500">
            {formatMessageTime(message.created_at)}
          </span>
          {message.editedAt && (
            <span className="text-xs text-gray-400">(edited)</span>
          )}
        </div>
        
        <div className={`relative ${isOwn ? 'ml-8' : 'mr-8'}`}>
          {message.replyTo && (
            <div className="mb-2 p-2 bg-gray-100 rounded-lg border-l-4 border-gray-300">
              <div className="text-xs text-gray-600 font-medium">
                {message.replyTo.user.displayName}
              </div>
              <div className="text-sm text-gray-700 truncate">
                {message.replyTo.fileData ? (
                  <span className="flex items-center gap-1">
                    <span>{getFileIcon(message.replyTo.fileData.filename, message.replyTo.fileData.mimeType)}</span>
                    {message.replyTo.fileData.filename}
                  </span>
                ) : (
                  message.replyTo.content
                )}
              </div>
            </div>
          )}
          
          <div
            className={`p-3 rounded-2xl ${
              isOwn
                ? 'bg-blue-500 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-900 rounded-bl-md'
            }`}
          >
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}
            {renderFileAttachment()}
          </div>

          {renderReactions()}
          
          {/* Message actions */}
          <div className={`absolute top-0 ${isOwn ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            <div className="flex items-center gap-1 bg-white shadow-lg rounded-lg p-1">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
                title="Add reaction"
                disabled={isAddingReaction}
              >
                😊
              </button>
              {onReply && (
                <button
                  onClick={() => onReply(message)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
                  title="Reply"
                >
                  <Reply className="w-4 h-4" />
                </button>
              )}
              <button
                className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Reaction picker */}
          {showReactions && (
            <div className={`absolute top-8 ${isOwn ? 'left-0' : 'right-0'} bg-white shadow-lg rounded-lg p-2 border z-10`}>
              <div className="grid grid-cols-4 gap-1">
                {COMMON_REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="p-2 hover:bg-gray-100 rounded text-lg transition-colors"
                    disabled={isAddingReaction}
                    title={getEmojiName(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to get emoji names for tooltips
function getEmojiName(emoji: string): string {
  const emojiNames: Record<string, string> = {
    '👍': 'Thumbs up',
    '👎': 'Thumbs down', 
    '❤️': 'Heart',
    '😂': 'Laughing',
    '🔥': 'Fire',
    '🚀': 'Rocket',
    '🙏': 'Prayer/Thank you',
    '😮': 'Surprised'
  };
  return emojiNames[emoji] || emoji;
}