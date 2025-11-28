/**
 * GET /api/chat/poll
 * 
 * Poll for chat response from Supabase after async workflow submission.
 * The vector inference API returns task IDs, and this endpoint polls
 * Supabase for the actual response.
 * 
 * Query Parameters:
 * - session_id: The chat session ID
 * - after: ISO timestamp to look for messages after
 * - workflow_id: (optional) The workflow ID to check
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://72.146.30.121:8100';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');
  const afterTimestamp = searchParams.get('after');
  const workflowId = searchParams.get('workflow_id');

  console.log('[/api/chat/poll] Polling for response:', { sessionId, afterTimestamp, workflowId });

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: 'Missing session_id parameter' },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Try to find assistant response
    let query = supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);

    // Filter by timestamp if provided
    if (afterTimestamp) {
      query = query.gt('created_at', afterTimestamp);
    }

    // Filter by workflow_id if provided
    if (workflowId) {
      query = query.eq('workflow_id', workflowId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[/api/chat/poll] Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database query failed', details: error.message },
        { status: 500 }
      );
    }

    if (data && data.length > 0) {
      console.log('[/api/chat/poll] Response found:', data[0].id);
      return NextResponse.json({
        success: true,
        found: true,
        message: data[0],
      });
    }

    // No response yet
    return NextResponse.json({
      success: true,
      found: false,
      message: null,
    });

  } catch (error) {
    console.error('[/api/chat/poll] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

