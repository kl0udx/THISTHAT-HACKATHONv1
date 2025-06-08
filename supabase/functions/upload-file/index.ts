import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// File validation constants (same as in send-message)
const ALLOWED_FILE_TYPES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  document: {
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf'],
    mimeTypes: [
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/markdown', 'application/rtf'
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  archive: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  video: {
    extensions: ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv'],
    mimeTypes: ['video/mp4', 'video/webm', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'],
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp4'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  code: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.cpp', '.c', '.php'],
    mimeTypes: ['application/javascript', 'text/javascript', 'application/typescript', 'text/css', 'text/html', 'application/json', 'application/xml', 'text/xml'],
    maxSize: 10 * 1024 * 1024, // 10MB
  }
};

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.jar', '.app', '.deb', '.pkg', '.dmg', '.run', '.msi', '.dll', '.sys', '.drv'];
const BLOCKED_MIME_TYPES = ['application/x-msdownload', 'application/x-executable', 'application/x-msdos-program', 'application/x-java-archive'];

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
}

function validateFile(filename: string, size: number, mimeType: string): { isValid: boolean; error?: string } {
  const extension = getFileExtension(filename);
  
  // Check blocked types
  if (BLOCKED_EXTENSIONS.includes(extension) || BLOCKED_MIME_TYPES.includes(mimeType)) {
    return { isValid: false, error: 'File type blocked for security reasons' };
  }

  // Check file size (100MB absolute limit)
  if (size > 100 * 1024 * 1024) {
    return { isValid: false, error: 'File too large (max 100MB)' };
  }

  // Validate against allowed types
  for (const [type, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (config.extensions.includes(extension) || config.mimeTypes.includes(mimeType)) {
      if (size > config.maxSize) {
        const maxSizeMB = Math.round(config.maxSize / (1024 * 1024));
        return { isValid: false, error: `File too large for ${type} files (max ${maxSizeMB}MB)` };
      }
      return { isValid: true };
    }
  }

  return { isValid: false, error: 'Unsupported file type' };
}

function generateSafeFilename(originalName: string): string {
  // Remove special characters and spaces, keep extension
  const extension = getFileExtension(originalName);
  const nameWithoutExt = originalName.slice(0, originalName.lastIndexOf('.')) || originalName;
  const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  return `${timestamp}_${safeName}${extension}`;
}

async function generateThumbnail(file: Uint8Array, mimeType: string): Promise<string | null> {
  // For now, return null - thumbnail generation would require image processing
  // In a full implementation, you'd use a library like Sharp or similar
  return null;
}

async function ensureBucketExists(supabase: any): Promise<void> {
  try {
    console.log('🪣 Checking if shared-files bucket exists...');
    
    // First, try to get the bucket to see if it exists
    const { data: existingBucket, error: getBucketError } = await supabase.storage.getBucket('shared-files');
    
    if (existingBucket) {
      console.log('🪣 Bucket already exists, continuing...');
      return;
    }

    console.log('🪣 Creating shared-files bucket...');
    const { data, error } = await supabase.storage.createBucket('shared-files', {
      public: true,
      fileSizeLimit: 104857600, // 100MB
      allowedMimeTypes: [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/markdown', 'application/rtf',
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
        'application/x-tar', 'application/gzip',
        'video/mp4', 'video/webm', 'video/avi', 'video/quicktime',
        'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp4',
        'application/javascript', 'text/javascript', 'application/typescript',
        'text/css', 'text/html', 'application/json', 'application/xml', 'text/xml'
      ]
    });
    
    if (error) {
      // Check if the error is because the bucket already exists
      if (error.message && error.message.includes('already exists')) {
        console.log('🪣 Bucket already exists, continuing...');
        return;
      }
      // Re-throw any other errors
      throw error;
    } else {
      console.log('🪣 Bucket created successfully:', data);
    }
  } catch (error) {
    // Check if the error is because the bucket already exists
    if (error.message && error.message.includes('already exists')) {
      console.log('🪣 Bucket already exists, continuing...');
      return;
    }
    // Re-throw any other errors
    console.error('🪣 Error ensuring bucket exists:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('📤 Upload request received');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure bucket exists before proceeding
    await ensureBucketExists(supabase);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const roomId = formData.get('roomId') as string;
    const userId = formData.get('userId') as string;
    const transferType = (formData.get('transferType') as string) || 'server';

    console.log('📤 Form data parsed:', {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      roomId,
      userId,
      transferType
    });

    if (!file || !roomId || !userId) {
      console.error('📤 Missing required fields');
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file
    const validation = validateFile(file.name, file.size, file.type);
    if (!validation.isValid) {
      console.error('📤 File validation failed:', validation.error);
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is in the room
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('id, display_name, user_color')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (participantError || !participant) {
      console.error('📤 User not found in room:', participantError);
      return new Response(JSON.stringify({ error: 'User not found in room' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let storagePath = null;
    let downloadUrl = null;
    let thumbnailUrl = null;

    if (transferType === 'server') {
      // Upload to Supabase Storage
      const safeFilename = generateSafeFilename(file.name);
      const fileName = `${roomId}/${safeFilename}`;
      
      console.log('📤 Uploading to storage:', fileName);
      
      // Convert File to ArrayBuffer for Deno compatibility
      const fileBuffer = await file.arrayBuffer();
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('shared-files')
        .upload(fileName, fileBuffer, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('📤 Storage upload error:', uploadError);
        return new Response(JSON.stringify({ 
          error: 'Failed to upload file to storage',
          details: uploadError.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('📤 Storage upload successful:', uploadData);
      storagePath = uploadData.path;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('shared-files')
        .getPublicUrl(fileName);

      downloadUrl = urlData.publicUrl;
      console.log('📤 Public URL generated:', downloadUrl);

      // Generate thumbnail for images
      if (file.type.startsWith('image/')) {
        thumbnailUrl = await generateThumbnail(new Uint8Array(fileBuffer), file.type);
      }
    }

    // Save file metadata to database
    console.log('📤 Saving file metadata to database');
    const { data: fileRecord, error: dbError } = await supabase
      .from('shared_files')
      .insert({
        room_id: roomId,
        uploader_id: userId,
        filename: generateSafeFilename(file.name),
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        transfer_type: transferType,
        thumbnail_url: thumbnailUrl,
        metadata: {
          lastModified: file.lastModified || Date.now(),
          uploadedAt: new Date().toISOString(),
          uploaderName: participant.display_name
        }
      })
      .select('*')
      .single();

    if (dbError) {
      console.error('📤 Database insert error:', dbError);
      
      // Clean up uploaded file if database insert fails
      if (storagePath) {
        console.log('📤 Cleaning up uploaded file due to database error');
        await supabase.storage
          .from('shared-files')
          .remove([storagePath]);
      }
      
      return new Response(JSON.stringify({ 
        error: 'Failed to save file metadata',
        details: dbError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📤 File upload completed successfully:', fileRecord.id);

    const response = {
      fileId: fileRecord.id,
      filename: fileRecord.filename,
      originalFilename: fileRecord.original_filename,
      fileSize: fileRecord.file_size,
      mimeType: fileRecord.mime_type,
      downloadUrl,
      thumbnailUrl,
      transferType: fileRecord.transfer_type,
      uploadedBy: {
        userId,
        displayName: participant.display_name,
        userColor: participant.user_color
      },
      createdAt: fileRecord.created_at
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('📤 Unexpected error in upload-file function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});