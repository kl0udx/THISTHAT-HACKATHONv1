import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface ResolveCommentRequest {
  commentId: string;
  userId: string;
  resolved: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
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

    const { commentId, userId, resolved }: ResolveCommentRequest = await req.json();

    if (!commentId || !userId || resolved === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get comment to verify it exists and user has permission
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select('user_id, room_id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user can resolve (comment author or room host)
    const { data: participant } = await supabase
      .from('participants')
      .select('is_host')
      .eq('user_id', userId)
      .eq('room_id', comment.room_id)
      .single();

    const canResolve = comment.user_id === userId || participant?.is_host;
    
    if (!canResolve) {
      return new Response(JSON.stringify({ error: 'Permission denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update comment resolution status
    const updateData: any = {
      resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? userId : null
    };

    const { data: updatedComment, error } = await supabase
      .from('comments')
      .update(updateData)
      .eq('id', commentId)
      .select('*')
      .single();

    if (error) {
      console.error('Comment update error:', error);
      return new Response(JSON.stringify({ error: 'Failed to update comment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      comment: {
        id: updatedComment.id,
        resolved: updatedComment.resolved,
        resolvedAt: updatedComment.resolved_at,
        resolvedBy: updatedComment.resolved_by
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});