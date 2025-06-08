import { supabase } from './supabase';
import { SharedFile } from '../services/fileService';

export function subscribeToFileShares(roomId: string, onFileShared: (file: SharedFile) => void) {
  console.log('📁 Setting up file sharing subscription for room:', roomId);
  
  return supabase
    .channel(`files_${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: roomId }
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'shared_files',
      filter: `room_id=eq.${roomId}`
    }, async (payload) => {
      console.log('📁 New file shared:', payload.new);
      
      try {
        // Fetch complete file data with user info
        const { data: fileWithUser } = await supabase
          .from('shared_files')
          .select(`
            *,
            participants!inner(display_name, user_color, avatar_emoji)
          `)
          .eq('id', payload.new.id)
          .single();

        if (fileWithUser) {
          let downloadUrl = null;
          
          if (fileWithUser.storage_path && fileWithUser.transfer_type === 'server') {
            const { data: urlData } = supabase.storage
              .from('shared-files')
              .getPublicUrl(fileWithUser.storage_path);
            downloadUrl = urlData.publicUrl;
          }

          const formattedFile: SharedFile = {
            id: fileWithUser.id,
            filename: fileWithUser.filename,
            originalFilename: fileWithUser.original_filename,
            fileSize: fileWithUser.file_size,
            mimeType: fileWithUser.mime_type,
            downloadUrl,
            thumbnailUrl: fileWithUser.thumbnail_url,
            transferType: fileWithUser.transfer_type,
            uploadedBy: {
              userId: fileWithUser.uploader_id,
              displayName: fileWithUser.participants.display_name,
              userColor: fileWithUser.participants.user_color,
              avatarEmoji: fileWithUser.participants.avatar_emoji
            },
            createdAt: fileWithUser.created_at,
            downloadCount: fileWithUser.download_count,
            metadata: fileWithUser.metadata
          };

          onFileShared(formattedFile);
        }
      } catch (error) {
        console.error('Failed to fetch file data:', error);
      }
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'shared_files',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      console.log('📁 File deleted:', payload.old);
      // You can add a callback for file deletion if needed
    })
    .subscribe((status) => {
      console.log('📁 File sharing subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ File sharing: SUCCESSFULLY SUBSCRIBED');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ File sharing: SUBSCRIPTION FAILED');
      }
    });
}

export function subscribeToFileUpdates(roomId: string, callbacks: {
  onFileShared?: (file: SharedFile) => void;
  onFileDeleted?: (fileId: string) => void;
  onFileDownloaded?: (fileId: string, downloadCount: number) => void;
}) {
  const channel = supabase.channel(`file_updates_${roomId}`);

  // File shared
  if (callbacks.onFileShared) {
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'shared_files',
      filter: `room_id=eq.${roomId}`
    }, async (payload) => {
      const fileData = await fetchFileWithUser(payload.new.id);
      if (fileData) {
        callbacks.onFileShared!(fileData);
      }
    });
  }

  // File deleted
  if (callbacks.onFileDeleted) {
    channel.on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'shared_files',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      callbacks.onFileDeleted!(payload.old.id);
    });
  }

  // File downloaded (download count updated)
  if (callbacks.onFileDownloaded) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'shared_files',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (payload.new.download_count !== payload.old.download_count) {
        callbacks.onFileDownloaded!(payload.new.id, payload.new.download_count);
      }
    });
  }

  return channel.subscribe();
}

async function fetchFileWithUser(fileId: string): Promise<SharedFile | null> {
  try {
    const { data: fileWithUser } = await supabase
      .from('shared_files')
      .select(`
        *,
        participants!inner(display_name, user_color, avatar_emoji)
      `)
      .eq('id', fileId)
      .single();

    if (!fileWithUser) return null;

    let downloadUrl = null;
    
    if (fileWithUser.storage_path && fileWithUser.transfer_type === 'server') {
      const { data: urlData } = supabase.storage
        .from('shared-files')
        .getPublicUrl(fileWithUser.storage_path);
      downloadUrl = urlData.publicUrl;
    }

    return {
      id: fileWithUser.id,
      filename: fileWithUser.filename,
      originalFilename: fileWithUser.original_filename,
      fileSize: fileWithUser.file_size,
      mimeType: fileWithUser.mime_type,
      downloadUrl,
      thumbnailUrl: fileWithUser.thumbnail_url,
      transferType: fileWithUser.transfer_type,
      uploadedBy: {
        userId: fileWithUser.uploader_id,
        displayName: fileWithUser.participants.display_name,
        userColor: fileWithUser.participants.user_color,
        avatarEmoji: fileWithUser.participants.avatar_emoji
      },
      createdAt: fileWithUser.created_at,
      downloadCount: fileWithUser.download_count,
      metadata: fileWithUser.metadata
    };
  } catch (error) {
    console.error('Failed to fetch file with user:', error);
    return null;
  }
}