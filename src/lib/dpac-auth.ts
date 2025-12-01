/**
 * DPaC Authentication Library
 * 
 * Validates JWT tokens from the DPaC Portal (WSO2 Identity Server)
 * Supports both LDAP and SPID user authentication
 * USER ID PRIORITY: email > fiscalNumber > sub
 */

import * as jose from 'jose';

// ============================================
// Types
// ============================================

export interface DpacJwtPayload {
  sub: string;
  iss: string;
  exp: number;
  iat?: number;
  aud?: string;
  // LDAP users
  email?: string;
  roles?: string;
  // SPID users
  fiscalNumber?: string;
  given_name?: string;
  family_name?: string;
}

export interface ValidationResult {
  valid: boolean;
  payload?: DpacJwtPayload;
  userId?: string;
  authType?: 'LDAP' | 'SPID';
  error?: string;
  errorCode?: string;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  authType: 'LDAP' | 'SPID';
  email?: string;
  fiscalNumber?: string;
  givenName?: string;
  familyName?: string;
  roles?: string;
  expiresAt: Date;
  createdAt: Date;
}

// ============================================
// Configuration
// ============================================

// Trusted WSO2 issuers (from environment or defaults)
const TRUSTED_ISSUERS = [
  process.env.WSO2_ISSUER_URI,
  'https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery',
  'https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery',
].filter(Boolean) as string[];

// Session configuration
const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL || '300', 10); // 5 minutes default

// ============================================
// JWKS Cache (avoid repeated fetches)
// ============================================

interface JwksCache {
  [issuer: string]: {
    jwks: jose.JWTVerifyGetKey;
    timestamp: number;
  };
}

const jwksCache: JwksCache = {};
const JWKS_CACHE_TTL = 3600000; // 1 hour

async function getJwks(issuer: string): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  const cached = jwksCache[issuer];

  if (cached && (now - cached.timestamp) < JWKS_CACHE_TTL) {
    return cached.jwks;
  }

  // Construct JWKS URI from issuer
  // WSO2 typically uses: {issuer}/.well-known/jwks.json or /oauth2/jwks
  let jwksUri: string;
  if (process.env.WSO2_JWKS_URI && issuer === process.env.WSO2_ISSUER_URI) {
    jwksUri = process.env.WSO2_JWKS_URI;
  } else {
    // Try standard OIDC discovery path
    jwksUri = issuer.replace('/oidcdiscovery', '/jwks');
  }

  console.log('[DPaC Auth] Fetching JWKS from:', jwksUri);

  const jwks = jose.createRemoteJWKSet(new URL(jwksUri));
  jwksCache[issuer] = { jwks, timestamp: now };

  return jwks;
}

// ============================================
// JWT Validation
// ============================================

/**
 * Validate a DPaC JWT token against WSO2
 */
export async function validateDpacJwt(token: string): Promise<ValidationResult> {
  try {
    // 1. Decode header to get issuer (without verification)
    const decoded = jose.decodeJwt(token) as DpacJwtPayload;

    console.log('[DPaC Auth] Validating JWT for subject:', decoded.sub);
    console.log('[DPaC Auth] JWT issuer:', decoded.iss);

    // 2. Verify issuer is trusted
    if (!TRUSTED_ISSUERS.includes(decoded.iss)) {
      console.error('[DPaC Auth] Untrusted issuer:', decoded.iss);
      console.error('[DPaC Auth] Trusted issuers:', TRUSTED_ISSUERS);
      return {
        valid: false,
        error: `JWT issuer not trusted: ${decoded.iss}`,
        errorCode: 'INVALID_ISSUER',
      };
    }

    // 3. Get JWKS for the issuer
    const jwks = await getJwks(decoded.iss);

    // 4. Verify signature and claims
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: decoded.iss,
      clockTolerance: 60, // 1 minute tolerance for clock skew
    });

    const jwtPayload = payload as unknown as DpacJwtPayload;

    // 5. Determine user type and ID
    // PRIORITY: email > fiscalNumber > sub
    let userId: string;
    let authType: 'LDAP' | 'SPID';

    // Priority 1: Use email if available (LDAP users always have email)
    if (jwtPayload.email) {
      userId = jwtPayload.email;
      authType = 'LDAP';
      console.log('[DPaC Auth] LDAP user identified by email:', userId);
    }
    // Priority 2: Use fiscalNumber for SPID users (no email)
    else if (jwtPayload.fiscalNumber) {
      userId = jwtPayload.fiscalNumber;
      authType = 'SPID';
      console.log('[DPaC Auth] SPID user identified by fiscalNumber:', userId);
    }
    // Priority 3: Fallback to sub claim
    else {
      userId = jwtPayload.sub;
      authType = 'LDAP';
      console.log('[DPaC Auth] User identified by sub (fallback):', userId);
    }

    return {
      valid: true,
      payload: jwtPayload,
      userId,
      authType,
    };

  } catch (error) {
    console.error('[DPaC Auth] JWT validation error:', error);

    if (error instanceof jose.errors.JWTExpired) {
      return {
        valid: false,
        error: 'JWT expired',
        errorCode: 'TOKEN_EXPIRED',
      };
    }

    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return {
        valid: false,
        error: 'Invalid JWT signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      return {
        valid: false,
        error: `JWT claim validation failed: ${error.message}`,
        errorCode: 'INVALID_CLAIMS',
      };
    }

    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
      errorCode: 'VALIDATION_ERROR',
    };
  }
}

// ============================================
// Session Management
// ============================================

// In-memory session store (for development)
// In production, use Redis
const sessions = new Map<string, SessionData>();

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `dpac_${timestamp}_${randomPart}`;
}

/**
 * Create a new session from validated JWT
 */
export function createSession(validationResult: ValidationResult, ttlSeconds?: number): SessionData | null {
  if (!validationResult.valid || !validationResult.payload || !validationResult.userId) {
    return null;
  }

  const ttl = ttlSeconds || SESSION_TTL_SECONDS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000);

  const session: SessionData = {
    sessionId: generateSessionId(),
    userId: validationResult.userId,
    authType: validationResult.authType!,
    email: validationResult.payload.email,
    fiscalNumber: validationResult.payload.fiscalNumber,
    givenName: validationResult.payload.given_name,
    familyName: validationResult.payload.family_name,
    roles: validationResult.payload.roles,
    expiresAt,
    createdAt: now,
  };

  // Store session
  sessions.set(session.sessionId, session);
  console.log('[DPaC Auth] Session created:', session.sessionId, 'expires:', expiresAt.toISOString());
  console.log('[DPaC Auth] User ID:', session.userId);

  // Schedule cleanup
  setTimeout(() => {
    sessions.delete(session.sessionId);
    console.log('[DPaC Auth] Session expired and removed:', session.sessionId);
  }, ttl * 1000);

  return session;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): SessionData | null {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if expired
  if (new Date() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Delete session
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Get session count (for monitoring)
 */
export function getSessionCount(): number {
  return sessions.size;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract JWT from Authorization header
 */
export function extractJwtFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

/**
 * Build session cookie string
 */
export function buildSessionCookie(sessionId: string, ttlSeconds?: number): string {
  const ttl = ttlSeconds || SESSION_TTL_SECONDS;
  const isProduction = process.env.NODE_ENV === 'production';

  const parts = [
    `dpac_session=${sessionId}`,
    `Path=/dpac`,
    `Max-Age=${ttl}`,
    'HttpOnly',
  ];

  // In production, add Secure and SameSite=None for cross-origin iframe
  if (isProduction) {
    parts.push('Secure');
    parts.push('SameSite=None');
  } else {
    // Development: use Lax for easier testing
    parts.push('SameSite=Lax');
  }

  return parts.join('; ');
}