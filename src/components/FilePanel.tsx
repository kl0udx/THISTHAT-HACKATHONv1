import React, { useState, useEffect } from 'react';
import { Files, X, Upload, Download, Trash2, Eye, Share2 } from 'lucide-react';
import { ParticipantAvatar } from './ParticipantAvatar';
import { FileService, SharedFile } from '../services/fileService';
import { subscribeToFileShares } from '../lib/realtimeFiles';
import { formatMessageTime } from '../utils/timeUtils';
import { validateFile, getFileIcon, formatFileSize, getFileType } from '../utils/fileValidation';
import { FileValidationModal } from './FileValidationModal';

interface FilePanelProps {
  roomId: string;
  userId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function FilePanel({ roomId, userId, isOpen, onToggle }: FilePanelProps) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, roomId]);

  useEffect(() => {
    if (!isOpen) return;

    console.log('📁 Setting up file sharing subscription');
    const channel = subscribeToFileShares(roomId, (newFile) => {
      console.log('📁 New file received:', newFile);
      setFiles(prev => [newFile, ...prev]);
    });

    return () => {
      console.log('📁 Cleaning up file subscription');
      channel.unsubscribe();
    };
  }, [isOpen, roomId]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const roomFiles = await FileService.getRoomFiles(roomId);
      setFiles(roomFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateFile(file);
    
    if (!validation.isValid) {
      setValidationModal({
        isOpen: true,
        error: validation.error!,
        fileName: file.name,
        category: validation.category!
      });
      
      // Clear the file input
      e.target.value = '';
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const uploadedFile = await FileService.uploadFile({
        file,
        roomId,
        userId,
        transferType: 'server'
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Add to files list
      setFiles(prev => [uploadedFile, ...prev]);

      // Clear input
      e.target.value = '';
      
      setTimeout(() => {
        setUploadProgress(0);
      }, 1000);

    } catch (error) {
      console.error('Upload failed:', error);
      setValidationModal({
        isOpen: true,
        error: error instanceof Error ? error.message : 'Upload failed',
        fileName: file.name,
        category: 'allowed'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (file: SharedFile) => {
    try {
      if (file.downloadUrl) {
        // Direct download for server files
        const link = document.createElement('a');
        link.href = file.downloadUrl;
        link.download = file.originalFilename;
        link.click();
      } else {
        // Handle P2P files
        const downloadData = await FileService.downloadFile(file.id);
        console.log('P2P download data:', downloadData);
        // In a real implementation, this would initiate WebRTC transfer
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async (file: SharedFile) => {
    if (!confirm(`Delete ${file.originalFilename}?`)) return;

    try {
      await FileService.deleteFile(file.id, userId);
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete file. You may not have permission.');
    }
  };

  const handlePreview = (file: SharedFile) => {
    if (file.downloadUrl && FileService.canPreview(file.mimeType)) {
      window.open(file.downloadUrl, '_blank');
    }
  };

  const canDelete = (file: SharedFile) => {
    return file.uploadedBy.userId === userId;
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 left-6 bg-purple-500 hover:bg-purple-600 text-white p-4 rounded-full shadow-lg transition-colors z-50"
        title="File Sharing"
      >
        <Files className="w-6 h-6" />
        {files.length > 0 && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {files.length}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 w-80 h-96 bg-white rounded-xl shadow-2xl border flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-purple-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Files className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-gray-900">Shared Files</h3>
          <span className="text-sm text-gray-500">({files.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
            disabled={isUploading}
          />
          <label
            htmlFor="file-upload"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isUploading 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
            }`}
            title="Upload file"
          >
            <Upload className="w-4 h-4" />
          </label>
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="p-4 border-b bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-blue-700">Uploading...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading files...</div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-gray-500">
              <Files className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No files shared yet</p>
              <p className="text-sm">Upload files to share with the room</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{FileService.getFileIcon(file.mimeType)}</div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate" title={file.originalFilename}>
                        {file.originalFilename}
                      </p>
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                        {getFileType(file.originalFilename, file.mimeType)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-500 mb-2">
                      {formatFileSize(file.fileSize)} • {formatMessageTime(file.createdAt)}
                      {file.downloadCount > 0 && ` • ${file.downloadCount} downloads`}
                    </p>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <ParticipantAvatar
                        displayName={file.uploadedBy.displayName}
                        userColor={file.uploadedBy.userColor}
                        size="sm"
                        showStatus={false}
                      />
                      <span className="text-xs text-gray-600">
                        {file.uploadedBy.displayName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      
                      {FileService.canPreview(file.mimeType) && file.downloadUrl && (
                        <button
                          onClick={() => handlePreview(file)}
                          className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => navigator.share?.({ 
                          title: file.originalFilename,
                          url: file.downloadUrl 
                        }) || navigator.clipboard.writeText(file.downloadUrl || '')}
                        className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900"
                        title="Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      
                      {canDelete(file) && (
                        <button
                          onClick={() => handleDelete(file)}
                          className="p-1 hover:bg-red-200 rounded text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Thumbnail for images */}
                {file.thumbnailUrl && (
                  <div className="mt-2">
                    <img
                      src={file.thumbnailUrl}
                      alt={file.originalFilename}
                      className="max-w-full h-auto rounded border cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => handlePreview(file)}
                      style={{ maxHeight: '100px' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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