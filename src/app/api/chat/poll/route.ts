/**
 * GET /api/chat/poll
 * 
 * Poll for chat response by checking Celery task status via Flower API.
 * Directly checks the specific task_id for combine_response_and_references.
 * 
 * Query Parameters:
 * - task_id: The Celery task ID to check (the combine_response_and_references task)
 * - request_time: Unix timestamp when the request was made
 */

import { NextRequest, NextResponse } from 'next/server';

// Flower API configuration (Celery monitoring)
const FLOWER_URL = process.env.FLOWER_URL || 'http://72.146.12.109:5555';

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
    } catch {
      // If still failing, try regex extraction for llm_output
      try {
        // Try to extract llm_output with regex - handles nested quotes
        const llmOutputMatch = input.match(/"llm_output":\s*"((?:[^"\\]|\\.)*)"/s);
        if (llmOutputMatch) {
          const llmOutput = llmOutputMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\'/g, "'");
          
          return {
            response: {
              llm_output: llmOutput
            }
          };
        }
        
        // Try with single quotes
        const llmOutputMatchSingle = input.match(/'llm_output':\s*'((?:[^'\\]|\\.)*)'/s);
        if (llmOutputMatchSingle) {
          const llmOutput = llmOutputMatchSingle[1]
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
          
          return {
            response: {
              llm_output: llmOutput
            }
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

/**
 * Extract llm_output directly from raw result string using regex
 * More reliable than full parsing for complex Python dicts
 */
function extractLlmOutputFromRaw(result: unknown): string | undefined {
  if (typeof result !== 'string') {
    // If it's already an object, try to access it directly
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if (obj.response && typeof obj.response === 'object') {
        const response = obj.response as Record<string, unknown>;
        if (typeof response.llm_output === 'string') {
          return response.llm_output;
        }
      }
    }
    return undefined;
  }
  
  // Try different regex patterns to extract llm_output from the raw string
  const patterns = [
    // Pattern 1: 'llm_output': 'content...'
    /'llm_output':\s*'((?:[^'\\]|\\.|'')*?)'\s*[,}]/s,
    // Pattern 2: "llm_output": "content..."
    /"llm_output":\s*"((?:[^"\\]|\\.)*)"\s*[,}]/s,
    // Pattern 3: Handle multi-line with escaped quotes
    /'llm_output':\s*"((?:[^"\\]|\\.)*)"\s*[,}]/s,
  ];
  
  for (const pattern of patterns) {
    const match = result.match(pattern);
    if (match && match[1]) {
      let output = match[1]
        // Unescape common escape sequences
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/''/g, "'"); // Python's escaped single quote inside single-quoted string
      
      // Only return if we got substantial content
      if (output.length > 10) {
        return output;
      }
    }
  }
  
  return undefined;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get('task_id');
  const requestTimeStr = searchParams.get('request_time');
  
  if (!taskId) {
    return NextResponse.json(
      { success: false, error: 'Missing task_id parameter' },
      { status: 400 }
    );
  }

  console.log('[/api/chat/poll] Polling for task:', { 
    taskId, 
    requestTime: requestTimeStr ? new Date(parseInt(requestTimeStr)).toISOString() : 'N/A'
  });

  try {
    // Directly check the specific task by ID
    const result = await checkTaskById(taskId);
    
    if (result.found && result.message?.content) {
      return NextResponse.json(result);
    }

    // Still processing
    return NextResponse.json({
      success: true,
      found: false,
      state: result.state || 'PENDING',
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
 * Directly check a specific task by its ID
 */
async function checkTaskById(taskId: string): Promise<{
  success: boolean;
  found: boolean;
  state?: string;
  message?: { content: string; references?: string[] };
}> {
  try {
    // Get task info directly by ID
    const taskInfoUrl = `${FLOWER_URL}/api/task/info/${taskId}`;
    console.log('[/api/chat/poll] Checking task:', taskId);

    const response = await fetch(taskInfoUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log('[/api/chat/poll] Task not found or error:', response.status);
      return { success: true, found: false, state: 'PENDING' };
    }

    const taskInfo = await response.json();
    console.log('[/api/chat/poll] Task state:', taskInfo.state);

    // If task failed
    if (taskInfo.state === 'FAILURE') {
      console.error('[/api/chat/poll] Task failed:', taskInfo.result);
      return { success: true, found: false, state: 'FAILURE' };
    }

    // If task is still pending/running
    if (taskInfo.state !== 'SUCCESS') {
      return { success: true, found: false, state: taskInfo.state };
    }

    // Task succeeded - extract the result
    if (taskInfo.result) {
      // Log raw result for debugging
      const rawResult = typeof taskInfo.result === 'string' 
        ? taskInfo.result.substring(0, 500) 
        : JSON.stringify(taskInfo.result).substring(0, 500);
      console.log('[/api/chat/poll] Raw result preview:', rawResult);
      
      // Try to extract llm_output directly from raw string first (more reliable)
      let llmOutput = extractLlmOutputFromRaw(taskInfo.result);
      
      if (!llmOutput) {
        // Fall back to parsing the full object
        const result = parsePythonDict(taskInfo.result);
        
        if (result) {
          // Try multiple paths to find llm_output
          const responseObj = result.response as Record<string, unknown> | string | undefined;
          
          // Path 1: response.llm_output (nested object) - this is the expected format
          if (typeof responseObj === 'object' && responseObj !== null) {
            llmOutput = responseObj.llm_output as string | undefined;
          }
          
          // Path 2: Check if result itself has llm_output
          if (!llmOutput && result.llm_output) {
            llmOutput = result.llm_output as string;
          }
        }
      }
      
      if (llmOutput) {
        console.log('[/api/chat/poll] ✅ Found llm_output in task:', taskId);
        console.log('[/api/chat/poll] Content preview:', llmOutput.substring(0, 100));
        
        let references: string[] = [];
        // Try to extract references too
        try {
          const refsMatch = typeof taskInfo.result === 'string' 
            ? taskInfo.result.match(/'references':\s*'(\[.*?\])'/s)
            : null;
          if (refsMatch && refsMatch[1] !== '[]') {
            references = JSON.parse(refsMatch[1].replace(/'/g, '"'));
          }
        } catch {
          // Ignore reference parsing errors
        }
        
        return {
          success: true,
          found: true,
          state: 'SUCCESS',
          message: {
            content: llmOutput,
            references,
          },
        };
      } else {
        console.log('[/api/chat/poll] Task succeeded but no llm_output found');
      }
    }

    return { success: true, found: false, state: 'SUCCESS' };
  } catch (error) {
    console.error('[/api/chat/poll] Error checking task:', error);
    return { success: true, found: false, state: 'ERROR' };
  }
}
