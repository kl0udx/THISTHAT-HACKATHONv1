import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface AddCommentRequest {
  roomId: string;
  userId: string;
  content: string;
  positionX: number;
  positionY: number;
  targetUrl?: string;
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
      roomId, 
      userId, 
      content, 
      positionX, 
      positionY, 
      targetUrl 
    }: AddCommentRequest = await req.json();

    if (!roomId || !userId || !content || positionX === undefined || positionY === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate content length
    if (content.length > 500) {
      return new Response(JSON.stringify({ error: 'Comment too long (max 500 characters)' }), {
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

    // Verify user is in the room
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('display_name, user_color, avatar_emoji')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .single();

    if (participantError || !participant) {
      return new Response(JSON.stringify({ error: 'User not in room' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        room_id: roomId,
        user_id: userId,
        content: content.trim(),
        position_x: Math.round(positionX),
        position_y: Math.round(positionY),
        target_url: targetUrl
      })
      .select('*')
      .single();

    if (error) {
      console.error('Comment creation error:', error);
      return new Response(JSON.stringify({ error: 'Failed to add comment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = {
      comment: {
        id: comment.id,
        content: comment.content,
        position: {
          x: comment.position_x,
          y: comment.position_y
        },
        targetUrl: comment.target_url,
        createdAt: comment.created_at,
        resolved: comment.resolved,
        user: {
          userId: comment.user_id,
          displayName: participant.display_name,
          userColor: participant.user_color,
          avatarEmoji: participant.avatar_emoji
        }
      }
    };

    return new Response(JSON.stringify(response), {
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