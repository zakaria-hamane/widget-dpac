/**
 * GET /api/chat/poll
 * 
 * Poll for chat response by checking Celery task status via Flower API.
 * Uses timestamp to find the most recent completed task with llm_output.
 * 
 * Query Parameters:
 * - task_id: The Celery task ID to check (from backend response)
 * - request_time: Unix timestamp when the request was made (to filter old tasks)
 */

import { NextRequest, NextResponse } from 'next/server';

// Flower API configuration (Celery monitoring)
const FLOWER_URL = process.env.FLOWER_URL || 'http://72.146.12.109:5555';

interface FlowerTaskInfo {
  uuid: string;
  name: string;
  state: string;
  received: number;
  started: number;
  succeeded: number;
  result?: unknown;
  args?: string;
  kwargs?: string;
}

interface FlowerTasksResponse {
  [taskId: string]: FlowerTaskInfo;
}

/**
 * Convert Python dict string to proper object
 * Handles single quotes, newlines, and Python-specific syntax
 */
function parsePythonDict(input: unknown): Record<string, unknown> | null {
  // If already an object, return it
  if (typeof input === 'object' && input !== null) {
    return input as Record<string, unknown>;
  }
  
  if (typeof input !== 'string') {
    return null;
  }

  try {
    // First try standard JSON parse
    return JSON.parse(input);
  } catch {
    // Convert Python dict to JSON
    try {
      let jsonString = input
        // Replace Python None with null
        .replace(/\bNone\b/g, 'null')
        // Replace Python True/False with true/false
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false');
      
      // Handle single quotes more carefully
      // Replace single quotes with double quotes, but preserve escaped quotes
      jsonString = jsonString.replace(/(?<!\\)'/g, '"');
      
      // Fix escaped single quotes (change \' to ')
      jsonString = jsonString.replace(/\\'/g, "'");
      
      return JSON.parse(jsonString);
    } catch (e) {
      // If still failing, try regex extraction
      try {
        // Extract llm_output using regex if present
        const llmOutputMatch = input.match(/'llm_output':\s*'([^']*(?:\\'[^']*)*)'/s);
        if (llmOutputMatch) {
          const llmOutput = llmOutputMatch[1]
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
          
          return {
            response: {
              llm_output: llmOutput
            }
          };
        }
        
        // Extract direct response if llm_output not found
        const responseMatch = input.match(/'response':\s*'([^']*(?:\\'[^']*)*)'/s);
        if (responseMatch) {
          const response = responseMatch[1]
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
          
          return {
            response: response
          };
        }
      } catch (regexError) {
        console.error('[parsePythonDict] Regex extraction failed:', regexError);
      }
      
      // Log only first 200 chars for debugging
      console.log('[parsePythonDict] Failed to parse:', input.substring(0, 200));
      return null;
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get('task_id');
  const requestTimeStr = searchParams.get('request_time');
  
  // Convert request_time to seconds (Flower uses Unix timestamp in seconds)
  const requestTime = requestTimeStr ? parseInt(requestTimeStr) / 1000 : (Date.now() / 1000 - 60);

  console.log('[/api/chat/poll] Polling for task:', { taskId, requestTime: new Date(requestTime * 1000).toISOString() });

  try {
    // Search for recent llm_call tasks that completed AFTER our request time
    const result = await findRecentLlmOutput(requestTime);
    
    if (result.found && result.message?.content) {
      return NextResponse.json(result);
    }

    // Still processing
    return NextResponse.json({
      success: true,
      found: false,
      state: 'PENDING',
      message: null,
    });

  } catch (error) {
    console.error('[/api/chat/poll] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to poll task status' },
      { status: 500 }
    );
  }
}

/**
 * Find the most recent llm_call task with llm_output that completed after requestTime
 */
async function findRecentLlmOutput(requestTime: number): Promise<{
  success: boolean;
  found: boolean;
  message?: { content: string; references?: string[] };
}> {
  try {
    // Get recent successful tasks
    const flowerApiUrl = `${FLOWER_URL}/api/tasks?limit=50&state=SUCCESS`;
    console.log('[/api/chat/poll] Searching recent tasks after:', new Date(requestTime * 1000).toISOString());

    const response = await fetch(flowerApiUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log('[/api/chat/poll] Failed to list tasks');
      return { success: true, found: false };
    }

    const tasks: FlowerTasksResponse = await response.json();
    
    // Filter llm_call tasks that completed AFTER our request time
    const recentLlmTasks = Object.entries(tasks)
      .filter(([, task]) => {
        const isLlmCall = task.name === 'llm_call';
        const completedAfterRequest = task.succeeded && task.succeeded > requestTime;
        return isLlmCall && completedAfterRequest;
      })
      .sort(([, a], [, b]) => (b.succeeded || 0) - (a.succeeded || 0));

    console.log('[/api/chat/poll] Found', recentLlmTasks.length, 'llm_call tasks completed after request time');

    // Check each task for llm_output (most recent first)
    for (const [taskId, task] of recentLlmTasks) {
      try {
        // Get full task info
        const taskInfoUrl = `${FLOWER_URL}/api/task/info/${taskId}`;
        const taskResponse = await fetch(taskInfoUrl, {
          headers: { 'Accept': 'application/json' },
        });

        if (!taskResponse.ok) continue;

        const taskInfo = await taskResponse.json();
        
        if (taskInfo.state === 'SUCCESS' && taskInfo.result) {
          const result = parsePythonDict(taskInfo.result);
          
          if (result) {
            // Try multiple paths to find llm_output
            const responseObj = result.response as Record<string, unknown> | string | undefined;
            
            let llmOutput: string | undefined;
            
            // Path 1: response.llm_output (nested object)
            if (typeof responseObj === 'object' && responseObj !== null) {
              llmOutput = responseObj.llm_output as string | undefined;
            }
            
            // Path 2: response is the direct string
            if (!llmOutput && typeof responseObj === 'string') {
              llmOutput = responseObj;
            }
            
            // Path 3: Check if result itself has llm_output
            if (!llmOutput && result.llm_output) {
              llmOutput = result.llm_output as string;
            }
            
            if (llmOutput) {
              console.log('[/api/chat/poll] ✅ Found llm_output in task:', taskId);
              console.log('[/api/chat/poll] Task completed at:', new Date((task.succeeded || 0) * 1000).toISOString());
              console.log('[/api/chat/poll] Content preview:', llmOutput.substring(0, 100));
              
              let references: string[] = [];
              try {
                if (typeof responseObj === 'object' && responseObj !== null) {
                  const refsStr = responseObj.references as string | undefined;
                  if (refsStr && refsStr !== '[]') {
                    references = JSON.parse(refsStr.replace(/'/g, '"'));
                  }
                }
              } catch {
                // Ignore reference parsing errors
              }
              
              return {
                success: true,
                found: true,
                message: {
                  content: llmOutput,
                  references,
                },
              };
            }
          }
        }
      } catch (error) {
        console.error('[/api/chat/poll] Error checking task:', taskId, error);
        continue;
      }
    }

    return { success: true, found: false };
  } catch (error) {
    console.error('[/api/chat/poll] Error searching tasks:', error);
    return { success: true, found: false };
  }
}