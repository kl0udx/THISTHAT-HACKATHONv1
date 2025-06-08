const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface SharedFile {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  transferType: 'server' | 'p2p';
  uploadedBy: {
    userId: string;
    displayName: string;
    userColor: string;
    avatarEmoji?: string;
  };
  createdAt: string;
  downloadCount: number;
  metadata?: any;
}

export interface FileUploadRequest {
  file: File;
  roomId: string;
  userId: string;
  transferType?: 'server' | 'p2p';
}

export interface FileUploadResponse {
  fileId: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  transferType: 'server' | 'p2p';
  uploadedBy: {
    userId: string;
    displayName: string;
    userColor: string;
  };
  createdAt: string;
}

export class FileService {
  static async uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', request.file);
      formData.append('roomId', request.roomId);
      formData.append('userId', request.userId);
      formData.append('transferType', request.transferType || 'server');

      console.log('📤 Uploading file:', {
        name: request.file.name,
        size: request.file.size,
        type: request.file.type,
        roomId: request.roomId,
        userId: request.userId
      });

      const response = await fetch(`${API_BASE}/upload-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      console.log('📤 Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('📤 Upload error response:', errorText);
        
        let errorMessage = 'Failed to upload file';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use the text as error message
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('📤 Upload successful:', result);
      return result;
    } catch (error) {
      console.error('📤 FileService upload error:', error);
      throw error;
    }
  }

  static async getRoomFiles(roomId: string, limit = 50): Promise<SharedFile[]> {
    const response = await fetch(`${API_BASE}/get-files?roomId=${encodeURIComponent(roomId)}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch files');
    }

    const data = await response.json();
    return data.files;
  }

  static async downloadFile(fileId: string): Promise<string> {
    const response = await fetch(`${API_BASE}/download-file?fileId=${encodeURIComponent(fileId)}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to download file');
    }

    // If it's a redirect response, return the URL
    if (response.redirected) {
      return response.url;
    }

    // For P2P files, return the metadata
    const data = await response.json();
    return data;
  }

  static async deleteFile(fileId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/delete-file`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ fileId, userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete file');
    }
  }

  // Utility methods
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static getFileType(mimeType: string): 'image' | 'document' | 'video' | 'audio' | 'archive' | 'code' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || 
        mimeType.includes('document') || 
        mimeType.includes('text') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation')) return 'document';
    if (mimeType.includes('zip') || 
        mimeType.includes('rar') || 
        mimeType.includes('archive')) return 'archive';
    if (mimeType.includes('javascript') || 
        mimeType.includes('css') || 
        mimeType.includes('html') ||
        mimeType.includes('json') ||
        mimeType.includes('xml')) return 'code';
    return 'other';
  }

  static getFileIcon(mimeType: string): string {
    const type = this.getFileType(mimeType);
    
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'archive': return '📦';
      case 'code': return '💻';
      default: return '📎';
    }
  }

  static canPreview(mimeType: string): boolean {
    return mimeType.startsWith('image/') || 
           mimeType === 'application/pdf' ||
           mimeType.startsWith('text/');
  }

  static generateThumbnail(file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate thumbnail size (max 200x200)
        const maxSize = 200;
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }
}