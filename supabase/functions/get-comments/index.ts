import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const roomId = url.searchParams.get('roomId');
    const includeResolved = url.searchParams.get('includeResolved') === 'true';

    if (!roomId) {
      return new Response(JSON.stringify({ error: 'Room ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First get comments
    let commentsQuery = supabase
      .from('comments')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    // Filter by resolved status if specified
    if (!includeResolved) {
      commentsQuery = commentsQuery.eq('resolved', false);
    }

    const { data: comments, error: commentsError } = await commentsQuery;

    if (commentsError) {
      console.error('Comments fetch error:', commentsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch comments' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get unique user IDs from comments
    const userIds = [...new Set([
      ...comments.map(c => c.user_id),
      ...comments.filter(c => c.resolved_by).map(c => c.resolved_by)
    ])];

    // Fetch participant data for all users
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('user_id, display_name, user_color, avatar_emoji')
      .in('user_id', userIds);

    if (participantsError) {
      console.error('Participants fetch error:', participantsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch participants' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a map for quick lookup
    const participantMap = new Map(
      participants.map(p => [p.user_id, p])
    );

    const formattedComments = comments.map(comment => {
      const userData = participantMap.get(comment.user_id);
      const resolverData = comment.resolved_by ? participantMap.get(comment.resolved_by) : null;

      return {
        id: comment.id,
        content: comment.content,
        position: {
          x: comment.position_x,
          y: comment.position_y
        },
        targetUrl: comment.target_url,
        createdAt: comment.created_at,
        resolved: comment.resolved,
        resolvedAt: comment.resolved_at,
        user: {
          userId: comment.user_id,
          displayName: userData?.display_name || 'Unknown User',
          userColor: userData?.user_color || '#000000',
          avatarEmoji: userData?.avatar_emoji || '🐘'
        },
        resolver: resolverData ? {
          displayName: resolverData.display_name,
          userColor: resolverData.user_color
        } : null
      };
    });

    return new Response(JSON.stringify({ comments: formattedComments }), {
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