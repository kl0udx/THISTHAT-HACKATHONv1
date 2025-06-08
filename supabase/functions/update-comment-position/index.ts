import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface UpdateCommentPositionRequest {
  commentId: string;
  positionX: number;
  positionY: number;
  userId: string;
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

    const { 
      commentId, 
      positionX, 
      positionY, 
      userId 
    }: UpdateCommentPositionRequest = await req.json();

    if (!commentId || positionX === undefined || positionY === undefined || !userId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate position coordinates
    if (positionX < 0 || positionX > 10000 || positionY < 0 || positionY > 10000) {
      return new Response(JSON.stringify({ error: 'Invalid position coordinates' }), {
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

    // Check if user can move comment (comment author or room host)
    const { data: participant } = await supabase
      .from('participants')
      .select('is_host')
      .eq('user_id', userId)
      .eq('room_id', comment.room_id)
      .single();

    const canMove = comment.user_id === userId || participant?.is_host;
    
    if (!canMove) {
      return new Response(JSON.stringify({ error: 'Permission denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update comment position
    const { data: updatedComment, error } = await supabase
      .from('comments')
      .update({
        position_x: Math.round(positionX),
        position_y: Math.round(positionY)
      })
      .eq('id', commentId)
      .select('*')
      .single();

    if (error) {
      console.error('Comment position update error:', error);
      return new Response(JSON.stringify({ error: 'Failed to update comment position' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      comment: {
        id: updatedComment.id,
        position: {
          x: updatedComment.position_x,
          y: updatedComment.position_y
        }
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