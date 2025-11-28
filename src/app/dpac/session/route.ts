/**
 * POST /dpac/session
 * 
 * Creates an authenticated session using the existing DPaC Portal JWT.
 * This endpoint validates the JWT against WSO2 and creates a session cookie
 * for the widget to use within the iframe.
 * 
 * The JWT is already issued by WSO2 when the user logs into the DPaC Portal.
 * This endpoint acts as a bridge between the host JWT and iframe-compatible cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateDpacJwt,
  createSession,
  extractJwtFromHeader,
  buildSessionCookie,
} from '@/lib/dpac-auth';

interface SessionRequest {
  jwt?: string;
  ttl?: number; // seconds, default 300
}

export async function POST(request: NextRequest) {
  console.log('[/dpac/session] Session creation request received');

  try {
    // 1. Extract JWT from Authorization header or request body
    const authHeader = request.headers.get('Authorization');
    let jwt = extractJwtFromHeader(authHeader);

    // If not in header, try request body
    if (!jwt) {
      try {
        const body: SessionRequest = await request.json();
        jwt = body.jwt;
      } catch {
        // Body parsing failed, continue without body JWT
      }
    }

    if (!jwt) {
      console.error('[/dpac/session] No JWT provided');
      return NextResponse.json(
        {
          success: false,
          error: 'No JWT provided. Include JWT in Authorization header or request body.',
          error_code: 'MISSING_JWT',
        },
        { status: 400 }
      );
    }

    // 2. Validate JWT against WSO2
    console.log('[/dpac/session] Validating JWT...');
    const validationResult = await validateDpacJwt(jwt);

    if (!validationResult.valid) {
      console.error('[/dpac/session] JWT validation failed:', validationResult.error);
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error,
          error_code: validationResult.errorCode,
        },
        { status: 401 }
      );
    }

    // 3. Get TTL from request body if provided
    let ttl = 300; // default 5 minutes
    try {
      const body: SessionRequest = await request.json().catch(() => ({}));
      if (body.ttl && typeof body.ttl === 'number' && body.ttl > 0 && body.ttl <= 3600) {
        ttl = body.ttl;
      }
    } catch {
      // Use default TTL
    }

    // 4. Create session
    const session = createSession(validationResult, ttl);

    if (!session) {
      console.error('[/dpac/session] Failed to create session');
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create session',
          error_code: 'SESSION_ERROR',
        },
        { status: 500 }
      );
    }

    console.log('[/dpac/session] Session created successfully:', session.sessionId);

    // 5. Build response with session cookie
    const response = NextResponse.json({
      success: true,
      session_id: session.sessionId,
      expires_at: session.expiresAt.toISOString(),
      user_id: session.userId,
      auth_type: session.authType,
      // Include name for SPID users
      ...(session.givenName && { given_name: session.givenName }),
      ...(session.familyName && { family_name: session.familyName }),
    });

    // 6. Set session cookie
    const cookieValue = buildSessionCookie(session.sessionId, ttl);
    response.headers.set('Set-Cookie', cookieValue);

    console.log('[/dpac/session] Response sent with session cookie');
    return response;

  } catch (error) {
    console.error('[/dpac/session] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  
  // CORS headers for cross-origin requests
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = allowedOrigins[0];
  
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');
  
  return response;
}

