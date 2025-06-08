import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Paperclip, Image } from 'lucide-react';
import { ChatMessage } from '../services/chatService';
import { ChatService } from '../services/chatService';
import { validateFile, getFileIcon, formatFileSize, getFileType } from '../utils/fileValidation';
import { FileValidationModal } from './FileValidationModal';

interface ChatInputProps {
  onSendMessage: (content: string, replyTo?: string, fileData?: any) => void;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
  disabled?: boolean;
}

export function ChatInput({ 
  onSendMessage, 
  replyTo, 
  onCancelReply, 
  onTyping, 
  onStopTyping,
  disabled = false 
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [validationModal, setValidationModal] = useState<{
    isOpen: boolean;
    error: string;
    fileName: string;
    category: 'blocked' | 'unknown' | 'allowed';
  }>({
    isOpen: false,
    error: '',
    fileName: '',
    category: 'allowed'
  });
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const lastTypingUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    const now = Date.now();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // If input is empty, stop typing immediately
    if (!value.trim() && !selectedFile) {
      if (isTyping) {
        console.log('⌨️ ChatInput: Stopping typing indicator (empty input)');
        setIsTyping(false);
        onStopTyping?.();
      }
      return;
    }

    // Start typing if not already typing
    if (!isTyping) {
      console.log('⌨️ ChatInput: Starting typing indicator');
      setIsTyping(true);
      onTyping?.();
      lastTypingUpdateRef.current = now;
    } else {
      // Send periodic typing updates (every 3 seconds) to keep the indicator alive
      if (now - lastTypingUpdateRef.current > 3000) {
        console.log('⌨️ ChatInput: Refreshing typing indicator');
        onTyping?.();
        lastTypingUpdateRef.current = now;
      }
    }

    // Set timeout to stop typing after 8 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      console.log('⌨️ ChatInput: Stopping typing indicator (8 second timeout)');
      setIsTyping(false);
      onStopTyping?.();
    }, 8000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('📎 File selected:', file.name, file.type, file.size);

    // Validate file
    const validation = validateFile(file);
    
    if (!validation.isValid) {
      console.log('❌ File validation failed:', validation.error);
      setValidationModal({
        isOpen: true,
        error: validation.error!,
        fileName: file.name,
        category: validation.category!
      });
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    console.log('✅ File validation passed');
    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedFile) || disabled) return;

    console.log('📤 ChatInput: Submitting message');
    
    // Immediately stop typing when sending
    if (isTyping) {
      console.log('⌨️ ChatInput: Stopping typing indicator (message sent)');
      setIsTyping(false);
      onStopTyping?.();
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    let fileData = null;
    if (selectedFile) {
      fileData = {
        filename: selectedFile.name,
        size: selectedFile.size,
        mimeType: selectedFile.type,
        type: getFileType(selectedFile.name, selectedFile.type)
      };
      console.log('📎 File data prepared:', fileData);
    }

    onSendMessage(message.trim() || '', replyTo?.id, fileData);
    setMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTyping) {
        console.log('⌨️ ChatInput: Cleanup - stopping typing indicator');
        onStopTyping?.();
      }
    };
  }, [isTyping, onStopTyping]);

  // Stop typing when input loses focus (but only if input is empty)
  const handleBlur = () => {
    if (isTyping && !message.trim() && !selectedFile) {
      console.log('⌨️ ChatInput: Input lost focus with empty content - stopping typing indicator');
      setIsTyping(false);
      onStopTyping?.();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  // Generate accept attribute for file input
  const getAcceptAttribute = () => {
    const imageTypes = 'image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml';
    const documentTypes = 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,.md,.rtf';
    const archiveTypes = 'application/zip,.rar,.7z,.tar,.gz';
    const videoTypes = 'video/mp4,video/webm,video/avi,video/quicktime';
    const audioTypes = 'audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac';
    const codeTypes = '.js,.ts,.jsx,.tsx,.css,.html,.json,.xml,.yaml,.yml,.py,.java,.cpp,.c,.php';
    
    return [imageTypes, documentTypes, archiveTypes, videoTypes, audioTypes, codeTypes].join(',');
  };

  return (
    <div className="border-t bg-white p-4">
      {replyTo && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900">
                Replying to {replyTo.user.displayName}
              </div>
              <div className="text-sm text-gray-600 truncate">
                {replyTo.fileData ? (
                  <span className="flex items-center gap-1">
                    <span>{getFileIcon(replyTo.fileData.filename, replyTo.fileData.mimeType)}</span>
                    {replyTo.fileData.filename}
                  </span>
                ) : (
                  replyTo.content
                )}
              </div>
            </div>
            <button
              onClick={onCancelReply}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getFileIcon(selectedFile.name, selectedFile.type)}</span>
              <div>
                <div className="text-sm font-medium text-gray-900">{selectedFile.name}</div>
                <div className="text-xs text-gray-600">
                  {formatFileSize(selectedFile.size)} • {getFileType(selectedFile.name, selectedFile.type)}
                </div>
              </div>
            </div>
            <button
              onClick={removeFile}
              className="p-1 hover:bg-blue-200 rounded text-blue-600 hover:text-blue-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept={getAcceptAttribute()}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-2xl transition-colors"
            title="Attach file (Images, Documents, Archives, Media, Code)"
            disabled={disabled}
          >
            <Paperclip className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={selectedFile ? "Add a caption..." : "Type a message..."}
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            rows={1}
            maxLength={2000}
          />
        </div>
        
        <button
          type="submit"
          disabled={(!message.trim() && !selectedFile) || disabled}
          className="self-end p-3 bg-blue-500 text-white rounded-2xl hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>

      {/* File Validation Modal */}
      <FileValidationModal
        isOpen={validationModal.isOpen}
        onClose={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
        error={validationModal.error}
        fileName={validationModal.fileName}
        category={validationModal.category}
      />
    </div>
  );
}