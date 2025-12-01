/**
 * GET /chat/stream
 * 
 * Server-Sent Events (SSE) endpoint for streaming chat responses.
 * Provides real-time token streaming from the vector inference backend.
 * 
 * Query Parameters:
 * - question: The user's question
 * - files: JSON array of file paths
 * - domain_id: Domain/bucket (default: "dpac")
 * - language: Response language (default: "it")
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface StreamEvent {
  token?: string;
  done?: boolean;
  error?: string;
  metadata?: {
    sources?: string[];
    workflow_id?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Extract query parameters
  const question = searchParams.get('question');
  const filesParam = searchParams.get('files');
  const domainId = searchParams.get('domain_id') || 'dpac';
  const language = searchParams.get('language') || 'it';
  
  console.log('[/chat/stream] SSE request received:', { question, filesParam, domainId, language });

  // Validate required parameters
  if (!question) {
    return new Response(
      `data: ${JSON.stringify({ error: 'Missing required parameter: question' })}\n\n`,
      {
        status: 400,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      }
    );
  }

  // Parse files array
  let files: string[] = [];
  if (filesParam) {
    try {
      files = JSON.parse(filesParam);
    } catch {
      files = filesParam.split(',').filter(f => f.trim());
    }
  }

  // Create the stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE events
      const sendEvent = (data: StreamEvent) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // Build backend payload
        const backendPayload = {
          input: {
            client_id: 'dpac',
            domain_id: domainId,
            input_text: question,
            language: language,
            project_id: 'dpac_portal',
            session_id: `stream_${Date.now()}`,
            user_id: 'stream_user',
            top_k: 5,
            limit: 10,
            workflow_id: 'vector_inference_001',
            ...(files.length > 0 && { files }),
          },
        };

        console.log('[/chat/stream] Calling backend API...');

        // Call backend API
        const backendUrl = process.env.BACKEND_API_URL || 'http://72.146.12.109:8002';
        const response = await fetch(`${backendUrl}/api/chat/vector_inference`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(backendPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[/chat/stream] Backend error:', response.status, errorText);
          sendEvent({ error: `Backend error: ${response.status}` });
          sendEvent({ done: true });
          controller.close();
          return;
        }

        const data = await response.json();
        console.log('[/chat/stream] Backend response received');

        // Determine the response content
        let responseContent = '';
        
        if (data.workflow_id && data.tasks) {
          // Async workflow response
          responseContent = 'La tua domanda è in elaborazione. Ti risponderò a breve dopo aver analizzato i documenti selezionati.';
          sendEvent({ 
            token: responseContent,
            metadata: { workflow_id: data.workflow_id }
          });
        } else if (data.answer || data.response) {
          // Direct response - simulate streaming by sending word by word
          responseContent = data.answer || data.response;
          
          // Split into words and stream them
          const words = responseContent.split(/(\s+)/);
          
          for (const word of words) {
            if (word) {
              sendEvent({ token: word });
              // Small delay to simulate streaming effect
              await new Promise(resolve => setTimeout(resolve, 30));
            }
          }
        } else {
          sendEvent({ token: 'Nessuna risposta ricevuta.' });
        }

        // Send completion event
        sendEvent({ 
          done: true,
          metadata: {
            sources: data.sources || [],
          }
        });

        console.log('[/chat/stream] Stream completed successfully');
        controller.close();

      } catch (error) {
        console.error('[/chat/stream] Error:', error);
        sendEvent({ 
          error: error instanceof Error ? error.message : 'Errore durante la comunicazione con il server'
        });
        sendEvent({ done: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

