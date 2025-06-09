// Comprehensive file validation utilities
export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: FileType;
  category?: FileCategory;
}

export type FileType = 'image' | 'document' | 'archive' | 'video' | 'audio' | 'code' | 'other';
export type FileCategory = 'allowed' | 'blocked' | 'unknown';

// Allowed file types with extensions and MIME types (updated with 500MB limits)
export const ALLOWED_FILE_TYPES = {
  // Images
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    mimeTypes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/svg+xml'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for images
    icon: '🖼️'
  },
  
  // Documents
  document: {
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf'],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'application/rtf'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for documents
    icon: '📄'
  },
  
  // Archives
  archive: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for archives
    icon: '📦'
  },
  
  // Video
  video: {
    extensions: ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv'],
    mimeTypes: [
      'video/mp4', 'video/webm', 'video/avi', 'video/quicktime',
      'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for videos
    icon: '🎥'
  },
  
  // Audio
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'],
    mimeTypes: [
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac',
      'audio/aac', 'audio/mp4'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for audio
    icon: '🎵'
  },
  
  // Code files
  code: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.cpp', '.c', '.php'],
    mimeTypes: [
      'application/javascript', 'text/javascript',
      'application/typescript',
      'text/css',
      'text/html',
      'application/json',
      'application/xml', 'text/xml',
      'application/x-yaml', 'text/yaml',
      'text/x-python',
      'text/x-java-source',
      'text/x-c++src', 'text/x-csrc',
      'application/x-php'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for code files
    icon: '💻'
  }
};

// Blocked file types for security
export const BLOCKED_FILE_TYPES = {
  extensions: [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
    '.app', '.deb', '.pkg', '.dmg', '.run', '.msi', '.dll', '.sys', '.drv'
  ],
  mimeTypes: [
    'application/x-msdownload',
    'application/x-executable',
    'application/x-msdos-program',
    'application/x-java-archive'
  ]
};

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
}

export function getFileType(filename: string, mimeType: string): FileType {
  const extension = getFileExtension(filename);
  
  for (const [type, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (config.extensions.includes(extension) || config.mimeTypes.includes(mimeType)) {
      return type as FileType;
    }
  }
  
  return 'other';
}

export function isFileBlocked(filename: string, mimeType: string): boolean {
  const extension = getFileExtension(filename);
  
  return BLOCKED_FILE_TYPES.extensions.includes(extension) ||
         BLOCKED_FILE_TYPES.mimeTypes.includes(mimeType);
}

export function validateFile(file: File): FileValidationResult {
  const extension = getFileExtension(file.name);
  const fileType = getFileType(file.name, file.type);
  
  // Check if file is blocked
  if (isFileBlocked(file.name, file.type)) {
    return {
      isValid: false,
      error: 'This file type is not allowed for security reasons.',
      category: 'blocked'
    };
  }
  
  // Check if file type is allowed
  if (fileType === 'other') {
    return {
      isValid: false,
      error: 'This file type is not supported.',
      category: 'unknown',
      fileType
    };
  }
  
  // Check file size
  const typeConfig = ALLOWED_FILE_TYPES[fileType];
  if (file.size > typeConfig.maxSize) {
    const maxSizeMB = Math.round(typeConfig.maxSize / (1024 * 1024));
    return {
      isValid: false,
      error: `File too large. Maximum size for ${fileType} files is ${maxSizeMB}MB.`,
      fileType,
      category: 'allowed'
    };
  }
  
  // Check overall file size limit (500MB)
  if (file.size > 500 * 1024 * 1024) {
    return {
      isValid: false,
      error: 'File too large. Maximum file size is 500MB.',
      fileType,
      category: 'allowed'
    };
  }
  
  return {
    isValid: true,
    fileType,
    category: 'allowed'
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getFileIcon(filename: string, mimeType: string): string {
  const fileType = getFileType(filename, mimeType);
  return ALLOWED_FILE_TYPES[fileType]?.icon || '📎';
}

export function getAllowedTypesText(): string {
  const categories = [
    { name: 'Images', types: 'JPG, PNG, GIF, WebP, SVG (max 500MB)' },
    { name: 'Documents', types: 'PDF, Word, Excel, PowerPoint, Text, Markdown (max 500MB)' },
    { name: 'Archives', types: 'ZIP, RAR, 7Z (max 500MB)' },
    { name: 'Videos', types: 'MP4, WebM, AVI, MOV (max 500MB)' },
    { name: 'Audio', types: 'MP3, WAV, OGG, FLAC (max 500MB)' },
    { name: 'Code', types: 'JS, CSS, HTML, JSON, XML, Python, Java (max 500MB)' }
  ];
  
  return categories.map(cat => `${cat.name}: ${cat.types}`).join('\n');
}