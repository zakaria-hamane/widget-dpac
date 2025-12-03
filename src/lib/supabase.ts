/**
 * Supabase Client for D.PaC Widget
 * 
 * Used to retrieve chat responses from the async workflow.
 * The vector inference API returns task IDs, and results are
 * stored in Supabase via webhook.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://72.146.12.109:8100';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Create Supabase client (singleton)
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// ============================================
// Message Types
// ============================================

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  workflow_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowResult {
  workflow_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: string;
  error?: string;
  sources?: string[];
  created_at: string;
  completed_at?: string;
}

// ============================================
// API Functions
// ============================================

/**
 * Poll for assistant response by session_id
 * Looks for the latest assistant message after a given timestamp
 */
export async function pollForResponse(
  sessionId: string,
  afterTimestamp: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<ChatMessage | null> {
  const supabase = getSupabaseClient();
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[Supabase] Polling for response, attempt ${attempt + 1}/${maxAttempts}`);
    
    try {
      // Query for assistant messages after the user message
      const { data, error } = await supabase
        .from('messages')  // Adjust table name as needed
        .select('*')
        .eq('session_id', sessionId)
        .eq('role', 'assistant')
        .gt('created_at', afterTimestamp)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[Supabase] Query error:', error);
      } else if (data && data.length > 0) {
        console.log('[Supabase] Response found:', data[0]);
        return data[0] as ChatMessage;
      }
    } catch (err) {
      console.error('[Supabase] Polling error:', err);
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.log('[Supabase] Polling timeout - no response found');
  return null;
}

/**
 * Poll for workflow result by workflow_id
 */
export async function pollForWorkflowResult(
  workflowId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<WorkflowResult | null> {
  const supabase = getSupabaseClient();
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[Supabase] Polling workflow ${workflowId}, attempt ${attempt + 1}/${maxAttempts}`);
    
    try {
      const { data, error } = await supabase
        .from('workflow_results')  // Adjust table name as needed
        .select('*')
        .eq('workflow_id', workflowId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('[Supabase] Query error:', error);
      } else if (data) {
        if (data.status === 'completed' || data.status === 'failed') {
          console.log('[Supabase] Workflow result found:', data);
          return data as WorkflowResult;
        }
        console.log('[Supabase] Workflow still processing:', data.status);
      }
    } catch (err) {
      console.error('[Supabase] Polling error:', err);
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.log('[Supabase] Polling timeout - workflow not completed');
  return null;
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(
  sessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient();
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Supabase] Error fetching chat history:', error);
      return [];
    }

    return (data || []) as ChatMessage[];
  } catch (err) {
    console.error('[Supabase] Error:', err);
    return [];
  }
}

/**
 * Subscribe to new messages in real-time
 */
export function subscribeToMessages(
  sessionId: string,
  onMessage: (message: ChatMessage) => void
): () => void {
  const supabase = getSupabaseClient();
  
  const channel = supabase
    .channel(`messages:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        console.log('[Supabase] New message received:', payload.new);
        onMessage(payload.new as ChatMessage);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
