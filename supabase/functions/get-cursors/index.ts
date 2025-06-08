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

    if (!roomId) {
      return new Response(JSON.stringify({ error: 'Room ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all active participants with cursor positions
    const { data: participants, error } = await supabase
      .from('participants')
      .select(`
        user_id,
        display_name,
        user_color,
        avatar_emoji,
        cursor_x,
        cursor_y,
        cursor_updated_at,
        current_platform,
        is_online
      `)
      .eq('room_id', roomId)
      .eq('is_online', true)
      .order('cursor_updated_at', { ascending: false });

    if (error) {
      console.error('Cursor fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch cursor positions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cursors = participants.map(p => ({
      userId: p.user_id,
      displayName: p.display_name,
      userColor: p.user_color,
      avatarEmoji: p.avatar_emoji,
      x: p.cursor_x,
      y: p.cursor_y,
      updatedAt: p.cursor_updated_at,
      platform: p.current_platform,
      isOnline: p.is_online
    }));

    return new Response(JSON.stringify({ cursors }), {
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