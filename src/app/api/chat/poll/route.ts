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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://72.146.12.109:8100';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

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

    // First, let's list all tables to debug
    console.log('[/api/chat/poll] Querying Supabase at:', SUPABASE_URL);
    
    // Try to find assistant response in 'messages' table
    // TODO: Update table name if different
    const tableName = 'messages'; // Change this if your table has a different name
    
    console.log(`[/api/chat/poll] Querying table: ${tableName}`);
    
    let query = supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10); // Get last 10 messages for debugging

    const { data, error } = await query;

    if (error) {
      console.error('[/api/chat/poll] Supabase error:', error);
      console.error('[/api/chat/poll] Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { 
          success: false, 
          error: 'Database query failed', 
          details: error.message,
          hint: error.hint || 'Check if table exists and has correct permissions',
          table: tableName
        },
        { status: 500 }
      );
    }
    
    console.log('[/api/chat/poll] Query result:', JSON.stringify(data, null, 2));

    if (data && data.length > 0) {
      console.log('[/api/chat/poll] Found', data.length, 'messages');
      
      // Try to find an assistant message matching our criteria
      const assistantMessage = data.find((msg: Record<string, unknown>) => {
        // Check various possible column names for role
        const role = msg.role || msg.type || msg.sender;
        const isAssistant = role === 'assistant' || role === 'bot' || role === 'ai';
        
        // Check session match if we have session_id
        const msgSessionId = msg.session_id || msg.sessionId || msg.chat_id;
        const sessionMatch = !sessionId || msgSessionId === sessionId;
        
        return isAssistant && sessionMatch;
      });
      
      if (assistantMessage) {
        console.log('[/api/chat/poll] Assistant message found:', assistantMessage);
        return NextResponse.json({
          success: true,
          found: true,
          message: {
            ...assistantMessage,
            content: assistantMessage.content || assistantMessage.message || assistantMessage.text || assistantMessage.response,
          },
        });
      }
      
      // Return all data for debugging
      return NextResponse.json({
        success: true,
        found: false,
        message: null,
        debug: {
          total_messages: data.length,
          sample: data.slice(0, 3), // First 3 messages for debugging
          looking_for: { session_id: sessionId, workflow_id: workflowId }
        }
      });
    }

    // No response yet
    return NextResponse.json({
      success: true,
      found: false,
      message: null,
      debug: { table: 'messages', session_id: sessionId }
    });

  } catch (error) {
    console.error('[/api/chat/poll] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

