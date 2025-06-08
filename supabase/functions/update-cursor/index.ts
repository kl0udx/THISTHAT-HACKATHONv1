import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface UpdateCursorRequest {
  userId: string;
  x: number;
  y: number;
  platform?: string;
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

    const { userId, x, y, platform }: UpdateCursorRequest = await req.json();

    if (!userId || x === undefined || y === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate cursor coordinates (reasonable bounds)
    if (x < 0 || x > 10000 || y < 0 || y > 10000) {
      return new Response(JSON.stringify({ error: 'Invalid cursor coordinates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updateData: any = {
      cursor_x: Math.round(x),
      cursor_y: Math.round(y),
      cursor_updated_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };

    if (platform) {
      updateData.current_platform = platform;
    }

    const { data: participant, error } = await supabase
      .from('participants')
      .update(updateData)
      .eq('user_id', userId)
      .select('room_id, display_name, user_color, cursor_x, cursor_y, current_platform')
      .single();

    if (error) {
      console.error('Cursor update error:', error);
      return new Response(JSON.stringify({ error: 'Failed to update cursor position' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!participant) {
      return new Response(JSON.stringify({ error: 'Participant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      cursor: {
        x: participant.cursor_x,
        y: participant.cursor_y,
        userId,
        displayName: participant.display_name,
        userColor: participant.user_color,
        platform: participant.current_platform,
        roomId: participant.room_id
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