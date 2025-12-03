# Authentication & Security - JWT Validation and WSO2 Integration

> **Document Version**: 1.0  
> **Last Updated**: December 3, 2025  
> **Author**: Zakaria  
> **For**: Guglielmo (PM)

---

## Table of Contents

1. [Overview](#overview)
2. [What Has Been Implemented](#what-has-been-implemented)
3. [How It Works](#how-it-works)
4. [Technical Implementation Details](#technical-implementation-details)
5. [User Type Detection](#user-type-detection)
6. [Portal Integration Guide](#portal-integration-guide)
7. [API Reference](#api-reference)
8. [Security Features](#security-features)
9. [Configuration](#configuration)

---

## Overview

The D.PaC Widget implements a **seamless authentication flow** that reuses the existing DPaC Portal JWT token. This means:

- ✅ **No second login required** for users
- ✅ **Same WSO2 identity provider** trusted by both portal and widget
- ✅ **Automatic user type detection** (SPID vs LDAP)
- ✅ **Secure cookie-based session** for iframe isolation

---

## What Has Been Implemented

### Completed Features

| Feature | Status | File Location |
|---------|--------|---------------|
| Session endpoint (`/dpac/session`) | ✅ Done | `src/app/dpac/session/route.ts` |
| JWT validation library | ✅ Done | `src/lib/dpac-auth.ts` |
| WSO2 JWKS signature verification | ✅ Done | `src/lib/dpac-auth.ts` |
| Issuer (`iss`) validation | ✅ Done | `src/lib/dpac-auth.ts` |
| Expiration (`exp`) check | ✅ Done | `src/lib/dpac-auth.ts` |
| LDAP user support | ✅ Done | `src/lib/dpac-auth.ts` |
| SPID user support | ✅ Done | `src/lib/dpac-auth.ts` |
| HttpOnly session cookie | ✅ Done | `src/app/dpac/session/route.ts` |
| CORS preflight handling | ✅ Done | `src/app/dpac/session/route.ts` |

---

## How It Works

### Authentication Flow Diagram

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   DLWEB Portal  │────►│  Widget Backend      │────►│   WSO2 IdP      │
│   (Angular)     │     │  POST /dpac/session  │     │ (Validate JWT)  │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                        │                          │
        │  1. User already       │                          │
        │     logged in via      │                          │
        │     WSO2 (SPID/LDAP)   │                          │
        │                        │                          │
        │  2. Existing JWT from  │                          │
        │     localStorage       │                          │
        │ ──────────────────────►│                          │
        │                        │                          │
        │                        │  3. Fetch JWKS from      │
        │                        │     WSO2 endpoint        │
        │                        │─────────────────────────►│
        │                        │                          │
        │                        │  4. Validate signature   │
        │                        │     & claims             │
        │                        │◄─────────────────────────│
        │                        │                          │
        │  5. Session cookie +   │                          │
        │     response           │                          │
        │◄───────────────────────│                          │
```

### Step-by-Step Process

1. **User logs into DPaC Portal** via WSO2 (using SPID or LDAP credentials)
2. **WSO2 issues a JWT** which is stored in the portal's `localStorage`
3. **When opening the widget**, the portal passes this **same JWT** to `/dpac/session`
4. **Widget backend validates** the JWT:
   - Fetches public keys from WSO2 JWKS endpoint
   - Verifies the JWT signature
   - Checks the issuer matches trusted WSO2 URIs
   - Ensures the token is not expired
   - Extracts user identity (email for LDAP, fiscalNumber for SPID)
5. **Widget creates a session cookie** scoped to `/dpac/*` routes
6. **Widget is now authenticated** and can make API calls

---

## Technical Implementation Details

### Session Endpoint (`/dpac/session`)

Located in `src/app/dpac/session/route.ts`:

```typescript
// Key functionality:
export async function POST(request: NextRequest) {
  // 1. Extract JWT from Authorization header or request body
  const authHeader = request.headers.get('Authorization');
  let jwt = extractJwtFromHeader(authHeader);

  // 2. Validate JWT against WSO2
  const validationResult = await validateDpacJwt(jwt);

  if (!validationResult.valid) {
    return NextResponse.json({
      success: false,
      error: validationResult.error,
      error_code: validationResult.errorCode,
    }, { status: 401 });
  }

  // 3. Create session
  const session = createSession(validationResult, ttl);

  // 4. Set HttpOnly cookie
  const cookieValue = buildSessionCookie(session.sessionId, ttl);
  response.headers.set('Set-Cookie', cookieValue);

  return response;
}
```

### JWT Validation Library (`/lib/dpac-auth.ts`)

The validation library performs these checks:

```typescript
export async function validateDpacJwt(token: string): Promise<ValidationResult> {
  // 1. Decode JWT to get issuer
  const decoded = jose.decodeJwt(token);
  
  // 2. Verify issuer is trusted
  if (!TRUSTED_ISSUERS.includes(decoded.iss)) {
    return { valid: false, error: 'Untrusted issuer' };
  }
  
  // 3. Fetch JWKS from WSO2
  const jwks = await getJwks(decoded.iss);
  
  // 4. Verify signature and claims
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: decoded.iss,
    clockTolerance: 60, // 1 minute tolerance
  });
  
  // 5. Determine user type
  if (payload.fiscalNumber) {
    return { valid: true, userId: payload.fiscalNumber, authType: 'SPID' };
  } else if (payload.email) {
    return { valid: true, userId: payload.email, authType: 'LDAP' };
  }
}
```

---

## User Type Detection

The system automatically identifies users based on JWT claims:

### LDAP Users (Internal/Government)

**JWT Structure:**
```json
{
  "sub": "stefano.solli@cultura.gov.it",
  "iss": "https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery",
  "roles": "everyone",
  "email": "stefano.solli@cultura.gov.it",
  "aud": "7wA7F6URmZEArFkPOfqBijd63dQa",
  "exp": 1761653468,
  "iat": 1761649868
}
```

**Identification:** User is identified by the `email` claim.

### SPID Users (Italian Digital Identity)

**JWT Structure:**
```json
{
  "sub": "SPID-002TINIT-LVLDAA85T50G702B",
  "iss": "https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery",
  "fiscalNumber": "TINIT-LVLDAA85T50G702B",
  "given_name": "Ada",
  "family_name": "Lovelace",
  "exp": 1762535261
}
```

**Identification:** User is identified by the `fiscalNumber` claim.

### Comparison Table

| Attribute | LDAP Users | SPID Users |
|-----------|------------|------------|
| Primary ID | `email` | `fiscalNumber` |
| Subject format | Email address | `SPID-xxx` prefix |
| Name available | No | Yes (`given_name`, `family_name`) |
| Roles claim | Yes | Sometimes |
| Common use case | Government employees | Citizens |

---

## Portal Integration Guide

### For DLWEB (Angular) Developers

**No new JWT minting required!** Simply pass the existing token:

```typescript
// In your Angular service
@Injectable({ providedIn: 'root' })
export class DpacWidgetService {
  
  constructor(private http: HttpClient) {}

  async initWidgetSession(): Promise<boolean> {
    // 1. Get the EXISTING JWT (already present from WSO2 login)
    const jwt = localStorage.getItem('access_token');
    
    if (!jwt) {
      console.error('User not logged in');
      return false;
    }
    
    // 2. Create widget session
    try {
      const response = await this.http.post<{success: boolean}>(
        '/dpac/session',
        { jwt, ttl: 300 },  // 5-minute session
        { withCredentials: true }  // Required for cookie
      ).toPromise();
      
      return response?.success || false;
    } catch (error) {
      console.error('Widget session creation failed:', error);
      return false;
    }
  }
}
```

### For Vanilla JavaScript

```javascript
async function initDpacWidget() {
  // Get existing JWT
  const jwt = localStorage.getItem('access_token');
  
  if (!jwt) {
    alert('Please log in first');
    return false;
  }

  // Create widget session
  const response = await fetch('/dpac/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    },
    credentials: 'include',
    body: JSON.stringify({ jwt, ttl: 300 })
  });

  const data = await response.json();
  
  if (data.success) {
    // Show widget
    document.getElementById('dpac-modal').style.display = 'block';
    return true;
  } else {
    alert('Session expired. Please refresh the page.');
    return false;
  }
}
```

---

## API Reference

### POST `/dpac/session`

Creates an authenticated session using the existing DPaC Portal JWT.

#### Request

**Headers:**
```http
POST /dpac/session HTTP/1.1
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Body:**
```json
{
  "jwt": "eyJhbGciOiJSUzI1NiIs...",
  "ttl": 300
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jwt` | string | Yes* | The existing DPaC Portal JWT |
| `ttl` | number | No | Session duration in seconds (default: 300, max: 3600) |

*JWT can be provided in Authorization header OR request body.

#### Response (Success - LDAP User)

```json
{
  "success": true,
  "session_id": "dpac_abc123def456",
  "expires_at": "2025-12-03T11:00:00.000Z",
  "user_id": "stefano.solli@cultura.gov.it",
  "auth_type": "LDAP"
}
```

#### Response (Success - SPID User)

```json
{
  "success": true,
  "session_id": "dpac_xyz789ghi012",
  "expires_at": "2025-12-03T11:00:00.000Z",
  "user_id": "SPID-002TINIT-LVLDAA85T50G702B",
  "auth_type": "SPID",
  "given_name": "Ada",
  "family_name": "Lovelace"
}
```

#### Response (Error - Expired Token)

```json
{
  "success": false,
  "error": "JWT expired",
  "error_code": "TOKEN_EXPIRED"
}
```

#### Response (Error - Invalid Issuer)

```json
{
  "success": false,
  "error": "JWT issuer not trusted",
  "error_code": "INVALID_ISSUER"
}
```

#### Response (Error - No JWT)

```json
{
  "success": false,
  "error": "No JWT provided. Include JWT in Authorization header or request body.",
  "error_code": "MISSING_JWT"
}
```

#### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_JWT` | 400 | No JWT provided in request |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `INVALID_ISSUER` | 401 | JWT issuer not in trusted list |
| `INVALID_SIGNATURE` | 401 | JWT signature verification failed |
| `SESSION_ERROR` | 500 | Failed to create session |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Security Features

### Session Cookie Attributes

```
Set-Cookie: dpac_session=<session_id>; HttpOnly; Secure; SameSite=None; Path=/dpac; Max-Age=300
```

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `HttpOnly` | true | Prevents JavaScript access (XSS protection) |
| `Secure` | true | HTTPS only (required for SameSite=None) |
| `SameSite` | None | Allows cross-origin iframe requests |
| `Path` | /dpac | Cookie only sent to widget routes |
| `Max-Age` | 300 | 5-minute expiration (configurable) |

### JWKS Caching

To avoid repeated network calls, JWKS keys are cached:

```typescript
const JWKS_CACHE_TTL = 3600000; // 1 hour
let jwksCache: jose.JWTVerifyGetKey | null = null;
let jwksCacheTime = 0;

async function getJwks(issuer: string): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  
  if (jwksCache && (now - jwksCacheTime) < JWKS_CACHE_TTL) {
    return jwksCache;  // Return cached JWKS
  }
  
  // Fetch fresh JWKS
  const jwksUri = `${issuer}/.well-known/jwks.json`;
  jwksCache = jose.createRemoteJWKSet(new URL(jwksUri));
  jwksCacheTime = now;
  
  return jwksCache;
}
```

### Validation Checks Performed

1. ✅ **Signature verification** - JWT signed by WSO2's private key
2. ✅ **Issuer validation** - `iss` claim matches trusted WSO2 URIs
3. ✅ **Expiration check** - `exp` claim is in the future
4. ✅ **Clock tolerance** - 60-second tolerance for server time drift
5. ✅ **Required claims** - `sub` claim must be present

---

## Configuration

### Environment Variables

```bash
# WSO2 Identity Provider Configuration
# Production
WSO2_ISSUER_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery
WSO2_JWKS_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/jwks

# Staging (uncomment for testing)
# WSO2_ISSUER_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery
# WSO2_JWKS_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/jwks

# Session Configuration
SESSION_TTL=300  # Default session duration in seconds

# CORS (for cross-origin deployments)
ALLOWED_ORIGINS=https://your-domain.com,https://staging.your-domain.com
```

### Trusted Issuers

The following WSO2 issuers are trusted by default:

| Environment | Issuer URI |
|-------------|------------|
| **Production** | `https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery` |
| **Staging** | `https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery` |

---

## Troubleshooting

### Common Issues

#### "JWT expired" Error

**Cause:** The user's session has expired in the portal.

**Solution:** Redirect user to re-login:
```javascript
if (response.error_code === 'TOKEN_EXPIRED') {
  window.location.href = '/login?redirect=' + encodeURIComponent(window.location.href);
}
```

#### "JWT issuer not trusted" Error

**Cause:** JWT was issued by a different WSO2 instance.

**Solution:** Check the `iss` claim in the JWT:
```javascript
const jwt = localStorage.getItem('access_token');
const payload = JSON.parse(atob(jwt.split('.')[1]));
console.log('Issuer:', payload.iss);
// Should be one of the trusted issuers above
```

#### Cookie Not Being Set

**Cause:** Missing `credentials: 'include'` in fetch request.

**Solution:**
```javascript
fetch('/dpac/session', {
  method: 'POST',
  credentials: 'include',  // ← This is required!
  // ...
});
```

---

## Summary

The authentication system provides a **seamless, secure experience** by:

1. **Reusing existing credentials** - No second login for users
2. **Validating against WSO2** - Same identity provider as the portal
3. **Supporting both user types** - LDAP and SPID users handled automatically
4. **Securing iframe sessions** - HttpOnly cookies with proper attributes

For any questions, contact: Zakaria (Backend/AI)

---

*Document created: December 3, 2025*

