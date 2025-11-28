/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring and load balancing.
 * Returns the status of the widget and its dependencies.
 */

import { NextResponse } from 'next/server';
import { getSessionCount } from '@/lib/dpac-auth';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    widget: 'ok' | 'error';
    minio: 'ok' | 'error' | 'unchecked';
    backend: 'ok' | 'error' | 'unchecked';
  };
  metrics: {
    active_sessions: number;
  };
}

const startTime = Date.now();

export async function GET() {
  const checks: HealthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      widget: 'ok',
      minio: 'unchecked',
      backend: 'unchecked',
    },
    metrics: {
      active_sessions: getSessionCount(),
    },
  };

  // Check MinIO connection
  try {
    const minioResponse = await fetch(`${getBaseUrl()}/api/minio/test`, {
      signal: AbortSignal.timeout(5000),
    });
    const minioData = await minioResponse.json();
    checks.checks.minio = minioData.success ? 'ok' : 'error';
  } catch {
    checks.checks.minio = 'error';
  }

  // Check Backend API
  const backendUrl = process.env.BACKEND_API_URL || 'http://72.146.30.121:8002';
  try {
    const backendResponse = await fetch(`${backendUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    checks.checks.backend = backendResponse.ok ? 'ok' : 'error';
  } catch {
    // Try alternate health endpoint
    try {
      const backendResponse = await fetch(`${backendUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      checks.checks.backend = backendResponse.ok ? 'ok' : 'error';
    } catch {
      checks.checks.backend = 'error';
    }
  }

  // Determine overall status
  const checkValues = Object.values(checks.checks);
  if (checkValues.every(v => v === 'ok' || v === 'unchecked')) {
    checks.status = 'ok';
  } else if (checks.checks.widget === 'ok') {
    checks.status = 'degraded';
  } else {
    checks.status = 'error';
  }

  const statusCode = checks.status === 'error' ? 503 : 200;

  return NextResponse.json(checks, { status: statusCode });
}

function getBaseUrl(): string {
  // In server-side context, construct URL from environment or use localhost
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  return 'http://localhost:3000';
}

