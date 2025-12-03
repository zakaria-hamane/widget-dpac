# D.PaC Widget Implementation Guide

> **Version**: 1.1.0  
> **Date**: December 3, 2025  
> **Authors**: Zakaria (Backend/AI), Hamid (Full-stack), reviewed by Guglielmo (PM)  
> **Repository**: `https://github.com/zakaria-hamane/widget-dpac/tree/develop`

---

## Table of Contents

1. [Overview](#1-overview)
   - [1.4 DPaC Platform Architecture](#14-dpac-platform-architecture)
2. [Architecture](#2-architecture)
3. [Current Implementation Status](#3-current-implementation-status) ⭐ UPDATED
4. [Frontend Integration Guide](#4-frontend-integration-guide)
   - [4.5 Authentication Handoff (DPaC JWT Reuse)](#45-authentication-handoff-dpac-jwt-reuse)
5. [Hosting & Operations Guide](#5-hosting--operations-guide)
6. [API Reference](#6-api-reference) ⭐ UPDATED
7. [Widget Events Reference](#7-widget-events-reference)
8. [Security Considerations](#8-security-considerations) ⭐ UPDATED
9. [Troubleshooting](#9-troubleshooting)
   - [9.0 DPaC-Specific Issues](#90-dpac-specific-issues)
10. [Development Responsibilities](#10-development-responsibilities) ⭐ UPDATED

> 📄 **See also**: [Authentication & Security Documentation](./docs/AUTHENTICATION_SECURITY.md) for detailed JWT/WSO2 implementation guide.

---

## 🔑 Quick Answer: JWT Reuse

> **Question from Guglielmo**: "We already have a JWT in place on the frontend — does it not suffice?"
>
> **Answer**: **Yes, the existing DPaC Portal JWT is sufficient.** No second login required.

### How It Works:

1. User logs into DPaC Portal via WSO2 (SPID/LDAP) → JWT stored in `localStorage`
2. When opening the widget, DLWEB passes this **same JWT** to `/dpac/session`
3. Widget backend validates the JWT against WSO2 (same issuer/signature)
4. Widget creates its own session cookie (required for iframe isolation)

### Why `/dpac/session` Is Still Needed:

- iframes cannot access the parent page's cookies (browser security)
- The widget needs its **own** cookie scoped to `/dpac/*`
- `/dpac/session` acts as a **bridge**: JWT in → Session cookie out

### Summary Table:

| Question | Answer |
|----------|--------|
| Do we need a new JWT? | **No** – reuse the existing WSO2 token |
| Do we need to mint tokens? | **No** – WSO2 already issued it |
| Why call `/dpac/session`? | To create a widget-specific cookie from the JWT |
| What if JWT is expired? | Show "Session expired" and redirect to login |

---

## Quick Reference: Who Does What?

| Responsibility | Widget Team (This Repo) | Portal Developers (DLWEB/Host App) |
|----------------|-------------------------|------------------------------|
| **Authentication** | Implement `/dpac/session` endpoint (validates existing DPaC JWT) | Pass existing WSO2 JWT to widget |
| **Streaming** | Implement `/chat/stream` SSE endpoint | N/A (handled by widget) |
| **Events** | Emit `dpac.widget.*` events | Listen & handle all events |
| **iframes** | Provide iframe pages | Embed iframes in host page |
| **Overlay Controls** | N/A | Backdrop, emergency close, ESC key |
| **Error Handling** | Emit error events, login fallback | Show errors, handle timeouts |
| **Security** | Validate JWT against WSO2, fix postMessage origin | Validate message origins |

> **📍 See [Section 10](#10-development-responsibilities) for detailed implementation requirements.**

> **🔐 Important**: The widget **reuses the existing DPaC Portal JWT** — no second login required. See [Section 1.4](#14-dpac-platform-architecture) for architecture details.

---

## 1. Overview

### 1.1 What is D.PaC Widget?

D.PaC (Document Processing and Chat) is an embeddable chat widget that allows users to:
- Ask questions against a document corpus stored in MinIO
- Select specific document sources/folders
- Receive AI-powered responses via a vector inference backend

### 1.2 Key Requirements

| Requirement | Description | Status |
|-------------|-------------|--------|
| **Auth without second login** | JWT passed from host → session cookie | ✅ Implemented |
| **Overlay control** | Host can close widget even if it doesn't respond | ✅ Implemented |
| **Streaming responses** | Real-time token streaming via SSE | ✅ Implemented |
| **Cross-origin iframe** | Widget embedded via iframe with proper cookie handling | ✅ Implemented |

### 1.3 Stakeholders

| Name | Role | Responsibilities |
|------|------|------------------|
| Zakaria | Backend/AI | API endpoints, inference integration, coordination |
| Guglielmo | PM (Italy Analytics) | Requirements, frontend team liaison |
| Hamid | Full-stack | Overlay implementation, integration notes |

### 1.4 DPaC Platform Architecture

The D.PaC Widget operates within the **Digital Platform for Cultural Heritage (DPaC)** ecosystem, a microservices architecture hosted on **OpenShift (RedHat)**.

#### 1.4.1 Platform Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **DLWEB** | Angular SPA + Nginx | Frontend portal (host application) |
| **MICDL-CORE** | Spring Boot | Session management, user context, Redis storage |
| **MICDL-SERVER** | Spring Boot | Main backend REST APIs |
| **MICDL-WFM** | Spring Boot | Workflow management |
| **WSO2** | Identity Server | Identity Provider (SPID/LDAP authentication) |
| **RH3Scale** | API Gateway | Authorization & rate limiting |
| **Redis** | In-memory DB | Persistent session storage |

#### 1.4.2 Authentication Flow (Existing)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────►│   WSO2      │────►│   DLWEB     │────►│ Microservices│
│ (SPID/LDAP) │     │ (IdP)       │     │ (Angular)   │     │ (Spring Boot)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │  1. Login         │                   │                   │
       │  (SPID/LDAP)      │                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │  2. JWT Token     │                   │                   │
       │◄──────────────────│                   │                   │
       │                   │                   │                   │
       │                   │  3. JWT stored    │                   │
       │                   │  in localStorage  │                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │                   │ 4. API calls with │
       │                   │                   │ Authorization:    │
       │                   │                   │ Bearer <JWT>      │
       │                   │                   │──────────────────►│
       │                   │                   │                   │
       │                   │                   │ 5. Validate JWT   │
       │                   │                   │ against WSO2      │
       │                   │                   │◄──────────────────│
```

#### 1.4.3 JWT Token Structure

**LDAP User Token:**
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

**SPID User Token:**
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

#### 1.4.4 Key JWT Claims

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | Subject (user ID) | `stefano.solli@cultura.gov.it` or `SPID-002TINIT-...` |
| `iss` | Issuer (WSO2 endpoint) | `https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery` |
| `fiscalNumber` | SPID fiscal code | `TINIT-LVLDAA85T50G702B` |
| `email` | User email (LDAP) | `stefano.solli@cultura.gov.it` |
| `roles` | User roles | `everyone`, `APPLICATION_USER`, `ROP`, `PM` |
| `exp` | Expiration timestamp | `1761653468` |
| `aud` | Audience (client ID) | `7wA7F6URmZEArFkPOfqBijd63dQa` |

#### 1.4.5 Widget Integration Strategy

> **✅ Key Point**: The widget **reuses the existing DPaC JWT** — no second login required.

The existing JWT from DLWEB is sufficient for widget authentication because:

1. **Same Identity Provider**: Both the portal and widget trust the same WSO2 issuer
2. **Standard Claims**: The JWT contains `sub`, `exp`, and user identification claims
3. **Valid Signature**: The widget backend can validate against the WSO2 public key

**However**, the `/dpac/session` endpoint is still required because:

- iframes cannot access the parent's cookies (cross-origin restrictions)
- The widget needs its own session cookie scoped to `/dpac/*`
- The session endpoint acts as a **bridge** between the host JWT and widget cookies

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HOST APPLICATION                             │
│  (Angular/React/Vue)                                                │
│                                                                      │
│  ┌──────────────┐  postMessage  ┌──────────────────────────────┐   │
│  │   Host JS    │◄────────────►│      D.PaC Widget (iframe)    │   │
│  │   Handlers   │               │                               │   │
│  └──────────────┘               │  ┌─────────┐ ┌─────────────┐ │   │
│                                 │  │Launcher │ │ Chat Modal  │ │   │
│                                 │  └─────────┘ └─────────────┘ │   │
│                                 │  ┌─────────┐ ┌─────────────┐ │   │
│                                 │  │ Source  │ │ File Select │ │   │
│                                 │  │ Picker  │ │             │ │   │
│                                 │  └─────────┘ └─────────────┘ │   │
│                                 └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NGINX REVERSE PROXY                          │
│  - /dpac/*  → Next.js widget (port 3000)                            │
│  - /api/*   → Next.js API routes                                    │
│  - Cookie passthrough with SameSite=None; Secure                    │
└─────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   Next.js    │  │    MinIO     │  │   Backend    │
            │  Widget App  │  │   Storage    │  │  Inference   │
            │  (Port 3000) │  │  (Port 9000) │  │  (Port 8002) │
            └──────────────┘  └──────────────┘  └──────────────┘
```

### 2.2 Widget Routes

| Route | Component | Purpose | Dimensions |
|-------|-----------|---------|------------|
| `/dpac/launcher` | `LauncherPage` | Floating button to open widget | 60×60px |
| `/dpac/modal` | `ChatCard` | Main chat interface | 294×418px |
| `/dpac/source-picker` | `SourceCard` | Select document sources | 294×418px |
| `/dpac/file-select` | `FileSelectCard` | Select specific files | 294×418px |
| `/dpac/host-test` | `HostTestPage` | Demo/test page with full integration | Full page |

### 2.3 API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/chat` | POST | Proxy to vector inference | ✅ Implemented |
| `/api/chat/poll` | GET | Poll Celery for async responses | ✅ Implemented |
| `/api/minio/folders` | GET | List MinIO folders | ✅ Implemented |
| `/api/minio/files` | GET | List files in folder | ✅ Implemented |
| `/api/minio/test` | GET | Test MinIO connection | ✅ Implemented |
| `/api/health` | GET | Health check endpoint | ✅ Implemented |
| `/dpac/session` | POST | Create auth session (JWT → cookie) | ✅ Implemented |
| `/chat/stream` | GET | SSE streaming | ✅ Implemented |

---

## 3. Current Implementation Status

### 3.1 What's Working

#### Overlay Controls ✅
- **10-second timeout**: If iframe doesn't emit `dpac.widget.loaded` within 10s, error overlay appears
- **Emergency close button**: Fixed X button in top-right corner (z-index: 2147483999)
- **Backdrop click**: Clicking outside widget closes it
- **ESC key**: Pressing Escape closes all modals
- **Multiple close options**: Widget header X, emergency X, backdrop, ESC

#### Widget Communication ✅
- All `postMessage` events working between host and iframes
- Proper event validation (checks for `dpac.widget.*` prefix)
- Message forwarding between iframe components

#### MinIO Integration ✅
- Folder listing from MinIO bucket
- File listing within folders
- File selection and confirmation

#### Basic Chat ✅
- Message sending via `/api/chat`
- Response display
- Loading states

### 3.2 Recently Implemented (December 2025)

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| `/dpac/session` endpoint | **HIGH** | ✅ Done | JWT validation and session cookie creation |
| SSE Streaming | **HIGH** | ✅ Done | Real-time token streaming via `/chat/stream` |
| Async Task Polling | **HIGH** | ✅ Done | Celery/Flower polling via `/api/chat/poll` |
| JWT/WSO2 Validation | **HIGH** | ✅ Done | Full WSO2 JWKS signature verification |
| Health Check | **MEDIUM** | ✅ Done | `/api/health` endpoint |

### 3.3 Remaining Items

| Feature | Priority | Description |
|---------|----------|-------------|
| Auth events | **MEDIUM** | `dpac.auth: ok\|fail`, `dpac.widget.ready` |
| Login modal fallback | **MEDIUM** | In-widget login when session fails |
| postMessage origin validation | **MEDIUM** | Replace `"*"` with specific origin |
| `dpac-embed.min.js` | **LOW** | Bundled embed script (currently placeholder) |

---

## 4. Frontend Integration Guide

### 4.1 Basic HTML Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>Host Application</title>
  <style>
    /* Ensure iframes don't have default borders */
    iframe { border: none; }
    
    /* Backdrop styles */
    #dpac-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(2px);
      z-index: 2147482999;
      display: none;
    }
    
    /* Emergency close button */
    #dpac-emergency-close {
      position: fixed;
      top: 10px;
      right: 10px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: 2px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      z-index: 2147483999;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    
    #dpac-emergency-close:hover {
      background: rgba(239, 68, 68, 0.9);
      transform: scale(1.1);
    }
  </style>
</head>
<body>
  <!-- Your application content -->
  <div id="app">
    <h1>My Application</h1>
  </div>

  <!-- D.PaC Widget iframes -->
  
  <!-- Launcher (always visible) -->
  <iframe 
    id="dpac-launcher" 
    src="/dpac/launcher"
    style="position:fixed;bottom:20px;right:20px;width:60px;height:60px;z-index:2147483000;background:transparent;">
  </iframe>

  <!-- Chat Modal (hidden by default) -->
  <iframe 
    id="dpac-modal" 
    src="/dpac/modal"
    style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483001;display:none;">
  </iframe>

  <!-- Source Picker (hidden by default) -->
  <iframe 
    id="dpac-source-picker" 
    src="/dpac/source-picker"
    style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483002;display:none;">
  </iframe>

  <!-- File Select (hidden by default) -->
  <iframe 
    id="dpac-file-select" 
    src="/dpac/file-select"
    style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483003;display:none;">
  </iframe>

  <!-- Backdrop -->
  <div id="dpac-backdrop"></div>
  
  <!-- Emergency Close Button -->
  <button id="dpac-emergency-close">✕</button>

  <script>
    // See Section 4.4 for full implementation
  </script>
</body>
</html>
```

### 4.2 Angular Integration

#### 4.2.1 Create DpacWidgetService

```typescript
// src/app/services/dpac-widget.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface DpacMessage {
  type: string;
  payload?: Record<string, unknown>;
}

export type WidgetState = 'closed' | 'chat' | 'source-picker' | 'file-select';

@Injectable({
  providedIn: 'root'
})
export class DpacWidgetService {
  private readonly WIDGET_ORIGIN = window.location.origin; // Same-origin
  private readonly LOAD_TIMEOUT_MS = 10000;
  
  private widgetState$ = new BehaviorSubject<WidgetState>('closed');
  private loadState = new Map<string, boolean>();
  private loadTimeouts = new Map<string, number>();
  
  public state$: Observable<WidgetState> = this.widgetState$.asObservable();
  
  constructor() {
    this.initMessageListener();
    this.initKeyboardListener();
  }
  
  private initMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent<DpacMessage>) => {
      // Security: Validate origin
      if (event.origin !== this.WIDGET_ORIGIN) {
        console.warn('[DPaC] Message from untrusted origin:', event.origin);
        return;
      }
      
      const { type, payload } = event.data;
      if (!type?.startsWith('dpac.widget.')) return;
      
      console.log('[DPaC]', type, payload);
      this.handleMessage(type, payload);
    });
  }
  
  private initKeyboardListener(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.widgetState$.value !== 'closed') {
        this.closeAll();
      }
    });
  }
  
  private handleMessage(type: string, payload?: Record<string, unknown>): void {
    switch (type) {
      case 'dpac.widget.loaded':
        this.handleLoaded(payload?.source as string);
        break;
      case 'dpac.widget.open':
        this.toggleChat();
        break;
      case 'dpac.widget.close':
        this.closeAll();
        break;
      case 'dpac.widget.openSourcePicker':
        this.widgetState$.next('source-picker');
        break;
      case 'dpac.widget.closeSourcePicker':
        this.widgetState$.next('chat');
        break;
      case 'dpac.widget.openFileSelect':
        this.widgetState$.next('file-select');
        this.forwardToFileSelect(payload);
        break;
      case 'dpac.widget.closeFileSelect':
        this.widgetState$.next('source-picker');
        break;
      case 'dpac.widget.filesSelected':
        this.forwardToChat(payload);
        break;
    }
  }
  
  private handleLoaded(source: string): void {
    this.loadState.set(source, true);
    const timeout = this.loadTimeouts.get(source);
    if (timeout) {
      clearTimeout(timeout);
      this.loadTimeouts.delete(source);
    }
  }
  
  private toggleChat(): void {
    if (this.widgetState$.value === 'closed') {
      this.widgetState$.next('chat');
      this.startLoadTimeout('modal');
    } else {
      this.closeAll();
    }
  }
  
  private startLoadTimeout(iframeName: string): void {
    const timeout = window.setTimeout(() => {
      if (!this.loadState.get(iframeName)) {
        console.error(`[DPaC] ${iframeName} failed to load within ${this.LOAD_TIMEOUT_MS}ms`);
        // Emit error event or show fallback UI
      }
    }, this.LOAD_TIMEOUT_MS);
    this.loadTimeouts.set(iframeName, timeout);
  }
  
  private forwardToFileSelect(payload?: Record<string, unknown>): void {
    const iframe = document.getElementById('dpac-file-select') as HTMLIFrameElement;
    iframe?.contentWindow?.postMessage(
      { type: 'dpac.widget.openFileSelect', payload },
      this.WIDGET_ORIGIN
    );
  }
  
  private forwardToChat(payload?: Record<string, unknown>): void {
    const iframe = document.getElementById('dpac-modal') as HTMLIFrameElement;
    iframe?.contentWindow?.postMessage(
      { type: 'dpac.widget.filesSelected', payload },
      this.WIDGET_ORIGIN
    );
  }
  
  public closeAll(): void {
    this.widgetState$.next('closed');
    this.loadTimeouts.forEach(timeout => clearTimeout(timeout));
    this.loadTimeouts.clear();
  }
  
  public open(): void {
    this.widgetState$.next('chat');
  }
}
```

#### 4.2.2 Create DpacWidgetComponent

```typescript
// src/app/components/dpac-widget/dpac-widget.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { DpacWidgetService, WidgetState } from '../../services/dpac-widget.service';

@Component({
  selector: 'app-dpac-widget',
  template: `
    <!-- Launcher -->
    <iframe 
      id="dpac-launcher" 
      [src]="launcherUrl"
      class="dpac-launcher">
    </iframe>

    <!-- Chat Modal -->
    <iframe 
      id="dpac-modal" 
      [src]="modalUrl"
      class="dpac-modal"
      [class.visible]="state !== 'closed'">
    </iframe>

    <!-- Source Picker -->
    <iframe 
      id="dpac-source-picker" 
      [src]="sourcePickerUrl"
      class="dpac-source-picker"
      [class.visible]="state === 'source-picker' || state === 'file-select'">
    </iframe>

    <!-- File Select -->
    <iframe 
      id="dpac-file-select" 
      [src]="fileSelectUrl"
      class="dpac-file-select"
      [class.visible]="state === 'file-select'">
    </iframe>

    <!-- Backdrop -->
    <div 
      class="dpac-backdrop" 
      [class.visible]="state !== 'closed'"
      (click)="close()">
    </div>

    <!-- Emergency Close -->
    <button 
      class="dpac-emergency-close"
      [class.visible]="state !== 'closed'"
      (click)="close()"
      aria-label="Close widget">
      ✕
    </button>
  `,
  styles: [`
    .dpac-launcher {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border: none;
      z-index: 2147483000;
      background: transparent;
    }
    
    .dpac-modal,
    .dpac-source-picker,
    .dpac-file-select {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 294px;
      height: 418px;
      border: none;
      display: none;
    }
    
    .dpac-modal { z-index: 2147483001; }
    .dpac-source-picker { z-index: 2147483002; }
    .dpac-file-select { z-index: 2147483003; }
    
    .dpac-modal.visible,
    .dpac-source-picker.visible,
    .dpac-file-select.visible {
      display: block;
    }
    
    .dpac-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(2px);
      z-index: 2147482999;
      display: none;
    }
    
    .dpac-backdrop.visible {
      display: block;
    }
    
    .dpac-emergency-close {
      position: fixed;
      top: 10px;
      right: 10px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: 2px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      z-index: 2147483999;
      display: none;
      font-size: 20px;
    }
    
    .dpac-emergency-close.visible {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .dpac-emergency-close:hover {
      background: rgba(239, 68, 68, 0.9);
      transform: scale(1.1);
    }
  `]
})
export class DpacWidgetComponent implements OnInit, OnDestroy {
  launcherUrl: SafeResourceUrl;
  modalUrl: SafeResourceUrl;
  sourcePickerUrl: SafeResourceUrl;
  fileSelectUrl: SafeResourceUrl;
  
  state: WidgetState = 'closed';
  private subscription?: Subscription;
  
  constructor(
    private sanitizer: DomSanitizer,
    private widgetService: DpacWidgetService
  ) {
    const baseUrl = ''; // Same-origin
    this.launcherUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/launcher`);
    this.modalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/modal`);
    this.sourcePickerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/source-picker`);
    this.fileSelectUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/file-select`);
  }
  
  ngOnInit(): void {
    this.subscription = this.widgetService.state$.subscribe(state => {
      this.state = state;
    });
  }
  
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
  
  close(): void {
    this.widgetService.closeAll();
  }
}
```

### 4.3 React Integration

```tsx
// src/components/DpacWidget.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';

type WidgetState = 'closed' | 'chat' | 'source-picker' | 'file-select';

interface DpacMessage {
  type: string;
  payload?: Record<string, unknown>;
}

const WIDGET_ORIGIN = window.location.origin;
const LOAD_TIMEOUT_MS = 10000;

export const DpacWidget: React.FC = () => {
  const [state, setState] = useState<WidgetState>('closed');
  const loadState = useRef(new Map<string, boolean>());
  const loadTimeouts = useRef(new Map<string, number>());
  
  const closeAll = useCallback(() => {
    setState('closed');
    loadTimeouts.current.forEach(timeout => clearTimeout(timeout));
    loadTimeouts.current.clear();
  }, []);
  
  const forwardToIframe = useCallback((id: string, message: DpacMessage) => {
    const iframe = document.getElementById(id) as HTMLIFrameElement;
    iframe?.contentWindow?.postMessage(message, WIDGET_ORIGIN);
  }, []);
  
  const startLoadTimeout = useCallback((iframeName: string) => {
    const timeout = window.setTimeout(() => {
      if (!loadState.current.get(iframeName)) {
        console.error(`[DPaC] ${iframeName} failed to load`);
      }
    }, LOAD_TIMEOUT_MS);
    loadTimeouts.current.set(iframeName, timeout);
  }, []);
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent<DpacMessage>) => {
      if (event.origin !== WIDGET_ORIGIN) return;
      
      const { type, payload } = event.data;
      if (!type?.startsWith('dpac.widget.')) return;
      
      console.log('[DPaC]', type, payload);
      
      switch (type) {
        case 'dpac.widget.loaded':
          loadState.current.set(payload?.source as string, true);
          break;
        case 'dpac.widget.open':
          setState(prev => prev === 'closed' ? 'chat' : 'closed');
          startLoadTimeout('modal');
          break;
        case 'dpac.widget.close':
          closeAll();
          break;
        case 'dpac.widget.openSourcePicker':
          setState('source-picker');
          break;
        case 'dpac.widget.closeSourcePicker':
          setState('chat');
          break;
        case 'dpac.widget.openFileSelect':
          setState('file-select');
          forwardToIframe('dpac-file-select', { type, payload });
          break;
        case 'dpac.widget.closeFileSelect':
          setState('source-picker');
          break;
        case 'dpac.widget.filesSelected':
          forwardToIframe('dpac-modal', { type, payload });
          break;
      }
    };
    
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    
    window.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [closeAll, forwardToIframe, startLoadTimeout]);
  
  const isOpen = state !== 'closed';
  
  return (
    <>
      {/* Launcher */}
      <iframe
        id="dpac-launcher"
        src="/dpac/launcher"
        title="DPaC Launcher"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 60,
          height: 60,
          border: 'none',
          zIndex: 2147483000,
          background: 'transparent',
        }}
      />
      
      {/* Chat Modal */}
      <iframe
        id="dpac-modal"
        src="/dpac/modal"
        title="DPaC Chat"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 294,
          height: 418,
          border: 'none',
          zIndex: 2147483001,
          display: isOpen ? 'block' : 'none',
        }}
      />
      
      {/* Source Picker */}
      <iframe
        id="dpac-source-picker"
        src="/dpac/source-picker"
        title="DPaC Source Picker"
        style={{
          position: 'fixed',
          bottom: 20,
          right: state === 'source-picker' || state === 'file-select' ? 322 : 20,
          width: 294,
          height: 418,
          border: 'none',
          zIndex: 2147483002,
          display: state === 'source-picker' || state === 'file-select' ? 'block' : 'none',
        }}
      />
      
      {/* File Select */}
      <iframe
        id="dpac-file-select"
        src="/dpac/file-select"
        title="DPaC File Select"
        style={{
          position: 'fixed',
          bottom: 20,
          right: state === 'file-select' ? 630 : 20,
          width: 294,
          height: 418,
          border: 'none',
          zIndex: 2147483003,
          display: state === 'file-select' ? 'block' : 'none',
        }}
      />
      
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={closeAll}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            zIndex: 2147482999,
          }}
        />
      )}
      
      {/* Emergency Close */}
      {isOpen && (
        <button
          onClick={closeAll}
          aria-label="Close widget"
          style={{
            position: 'fixed',
            top: 10,
            right: 10,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer',
            zIndex: 2147483999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          ✕
        </button>
      )}
    </>
  );
};
```

### 4.4 Full Vanilla JavaScript Implementation

```javascript
// dpac-widget-host.js
(function() {
  'use strict';
  
  // ===== CONFIGURATION =====
  const CONFIG = {
    WIDGET_ORIGIN: window.location.origin,
    LOAD_TIMEOUT_MS: 10000,
    CARD_WIDTH: 294,
    CARD_HEIGHT: 418,
    GAP: 8,
    MARGIN: 20,
    DEBUG: true,
  };
  
  // ===== STATE =====
  const state = {
    iframeLoaded: {
      launcher: false,
      modal: false,
      sourcePicker: false,
      fileSelect: false,
    },
    loadTimeouts: {},
    currentView: 'closed', // 'closed' | 'chat' | 'source-picker' | 'file-select'
  };
  
  // ===== UTILITIES =====
  function log(...args) {
    if (CONFIG.DEBUG) console.log('[DPaC Host]', ...args);
  }
  
  function logError(...args) {
    console.error('[DPaC Host ERROR]', ...args);
  }
  
  // ===== DOM ELEMENTS =====
  const elements = {
    launcher: document.getElementById('dpac-launcher'),
    modal: document.getElementById('dpac-modal'),
    sourcePicker: document.getElementById('dpac-source-picker'),
    fileSelect: document.getElementById('dpac-file-select'),
    backdrop: document.getElementById('dpac-backdrop'),
    emergencyClose: document.getElementById('dpac-emergency-close'),
  };
  
  // ===== SHOW/HIDE FUNCTIONS =====
  function show(el) {
    if (el) {
      el.style.display = el.id === 'dpac-emergency-close' ? 'flex' : 'block';
      log('Showing:', el.id);
    }
  }
  
  function hide(el) {
    if (el) {
      el.style.display = 'none';
      log('Hiding:', el.id);
    }
  }
  
  function isAnyModalOpen() {
    return state.currentView !== 'closed';
  }
  
  function closeAll() {
    hide(elements.modal);
    hide(elements.sourcePicker);
    hide(elements.fileSelect);
    hide(elements.backdrop);
    hide(elements.emergencyClose);
    state.currentView = 'closed';
    
    // Clear all timeouts
    Object.values(state.loadTimeouts).forEach(t => clearTimeout(t));
    state.loadTimeouts = {};
    
    log('All modals closed');
  }
  
  // ===== LOAD TIMEOUT =====
  function startLoadTimeout(iframeName, iframeEl) {
    if (state.loadTimeouts[iframeName]) {
      clearTimeout(state.loadTimeouts[iframeName]);
    }
    
    state.loadTimeouts[iframeName] = setTimeout(() => {
      if (!state.iframeLoaded[iframeName]) {
        logError(`${iframeName} failed to load within ${CONFIG.LOAD_TIMEOUT_MS}ms`);
        showTimeoutError(iframeEl);
      }
    }, CONFIG.LOAD_TIMEOUT_MS);
  }
  
  function showTimeoutError(iframeEl) {
    if (!iframeEl || !iframeEl.parentElement) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'dpac-error-overlay';
    overlay.innerHTML = `
      <div style="text-align:center;padding:20px;background:#fff;border-radius:8px;max-width:250px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom:16px;">
          <circle cx="12" cy="12" r="10" stroke="#EF4444" stroke-width="2"/>
          <path d="M12 8v4M12 16h.01" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h3 style="margin:0 0 8px;color:#111;font-size:16px;">Widget non disponibile</h3>
        <p style="margin:0 0 16px;color:#666;font-size:13px;">Il widget non risponde. Verifica la connessione.</p>
        <button onclick="this.closest('.dpac-error-overlay').remove()" style="
          padding:8px 16px;background:#334C66;color:white;border:none;
          border-radius:6px;cursor:pointer;font-size:13px;">
          Chiudi
        </button>
      </div>
    `;
    overlay.style.cssText = `
      position:absolute;inset:0;display:flex;align-items:center;
      justify-content:center;background:#fff;z-index:999999;
    `;
    
    iframeEl.parentElement.style.position = 'relative';
    iframeEl.parentElement.appendChild(overlay);
  }
  
  // ===== POSITIONING =====
  function positionCards() {
    const { modal, sourcePicker, fileSelect } = elements;
    const { MARGIN, CARD_WIDTH, GAP } = CONFIG;
    
    // Count visible cards
    let visibleCount = 0;
    if (modal?.style.display === 'block') visibleCount++;
    if (sourcePicker?.style.display === 'block') visibleCount++;
    if (fileSelect?.style.display === 'block') visibleCount++;
    
    // Check available width
    const viewportWidth = window.innerWidth;
    const neededWidth = MARGIN + visibleCount * CARD_WIDTH + (visibleCount - 1) * GAP + MARGIN;
    const canFitHorizontally = viewportWidth >= neededWidth;
    
    if (canFitHorizontally) {
      // Horizontal layout
      let rightOffset = MARGIN;
      
      if (fileSelect?.style.display === 'block') {
        fileSelect.style.right = rightOffset + 'px';
        fileSelect.style.bottom = MARGIN + 'px';
        rightOffset += CARD_WIDTH + GAP;
      }
      
      if (sourcePicker?.style.display === 'block') {
        sourcePicker.style.right = rightOffset + 'px';
        sourcePicker.style.bottom = MARGIN + 'px';
        rightOffset += CARD_WIDTH + GAP;
      }
      
      if (modal?.style.display === 'block') {
        modal.style.right = rightOffset + 'px';
        modal.style.bottom = MARGIN + 'px';
      }
    } else {
      // Vertical stack (mobile)
      let bottomOffset = MARGIN;
      
      [fileSelect, sourcePicker, modal].forEach(el => {
        if (el?.style.display === 'block') {
          el.style.right = MARGIN + 'px';
          el.style.bottom = bottomOffset + 'px';
          bottomOffset += CONFIG.CARD_HEIGHT + GAP;
        }
      });
    }
  }
  
  // ===== MESSAGE HANDLING =====
  function isValidMessage(data) {
    return data && 
           typeof data === 'object' && 
           typeof data.type === 'string' &&
           data.type.startsWith('dpac.widget.');
  }
  
  function sendToIframe(iframeEl, message) {
    if (!iframeEl?.contentWindow) return false;
    try {
      iframeEl.contentWindow.postMessage(message, CONFIG.WIDGET_ORIGIN);
      return true;
    } catch (e) {
      logError('Failed to send message:', e);
      return false;
    }
  }
  
  function handleMessage(event) {
    // Security: Validate origin
    if (event.origin !== CONFIG.WIDGET_ORIGIN) {
      logError('Message from untrusted origin:', event.origin);
      return;
    }
    
    if (!isValidMessage(event.data)) return;
    
    const { type, payload } = event.data;
    log('Received:', type, payload);
    
    switch (type) {
      case 'dpac.widget.loaded':
        handleLoaded(payload?.source);
        break;
        
      case 'dpac.widget.open':
        if (isAnyModalOpen()) {
          closeAll();
        } else {
          show(elements.modal);
          show(elements.backdrop);
          show(elements.emergencyClose);
          state.currentView = 'chat';
          startLoadTimeout('modal', elements.modal);
          positionCards();
        }
        break;
        
      case 'dpac.widget.close':
        closeAll();
        break;
        
      case 'dpac.widget.openSourcePicker':
        show(elements.sourcePicker);
        state.currentView = 'source-picker';
        startLoadTimeout('sourcePicker', elements.sourcePicker);
        positionCards();
        break;
        
      case 'dpac.widget.closeSourcePicker':
        hide(elements.sourcePicker);
        state.currentView = elements.fileSelect?.style.display === 'block' ? 'file-select' : 'chat';
        positionCards();
        break;
        
      case 'dpac.widget.openFileSelect':
        show(elements.fileSelect);
        state.currentView = 'file-select';
        sendToIframe(elements.fileSelect, event.data);
        startLoadTimeout('fileSelect', elements.fileSelect);
        positionCards();
        break;
        
      case 'dpac.widget.closeFileSelect':
        hide(elements.fileSelect);
        state.currentView = elements.sourcePicker?.style.display === 'block' ? 'source-picker' : 'chat';
        positionCards();
        break;
        
      case 'dpac.widget.filesSelected':
        log('Files selected:', payload?.files);
        sendToIframe(elements.modal, event.data);
        break;
    }
  }
  
  function handleLoaded(source) {
    if (source && source in state.iframeLoaded) {
      state.iframeLoaded[source] = true;
      log('Iframe loaded:', source);
      
      if (state.loadTimeouts[source]) {
        clearTimeout(state.loadTimeouts[source]);
        delete state.loadTimeouts[source];
      }
    }
  }
  
  // ===== EVENT LISTENERS =====
  window.addEventListener('message', handleMessage);
  
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isAnyModalOpen()) {
      closeAll();
      event.preventDefault();
    }
  });
  
  window.addEventListener('resize', () => {
    if (isAnyModalOpen()) positionCards();
  });
  
  // Backdrop click
  if (elements.backdrop) {
    elements.backdrop.addEventListener('click', closeAll);
  }
  
  // Emergency close click
  if (elements.emergencyClose) {
    elements.emergencyClose.addEventListener('click', closeAll);
  }
  
  log('DPaC Widget Host initialized');
})();
```

### 4.5 Authentication Handoff (DPaC JWT Reuse)

The widget **reuses the existing DPaC Portal JWT** from DLWEB. No additional login is required.

> **Important**: The JWT is already issued by WSO2 when the user logs into the DPaC Portal. The widget backend validates this same token.

#### 4.5.1 Angular Integration (DLWEB)

```typescript
// src/app/services/dpac-widget-auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface SessionResponse {
  success: boolean;
  session_id?: string;
  expires_at?: string;
  user_id?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DpacWidgetAuthService {

  constructor(private http: HttpClient) {}

  /**
   * Get the existing DPaC JWT from localStorage or your auth service.
   * This is the same JWT issued by WSO2 when the user logged in.
   */
  private getExistingJwt(): string | null {
    // Option 1: From localStorage (common pattern in DLWEB)
    return localStorage.getItem('access_token');
    
    // Option 2: From your AuthService
    // return this.authService.getAccessToken();
  }

  /**
   * Initialize widget session by passing the existing DPaC JWT.
   * The widget backend validates this against WSO2 and creates a session cookie.
   */
  initWidgetSession(): Observable<SessionResponse> {
    const jwt = this.getExistingJwt();
    
    if (!jwt) {
      return of({ 
        success: false, 
        error: 'No JWT found. User must be logged into DPaC Portal first.' 
      });
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    });

    return this.http.post<SessionResponse>(
      '/dpac/session',
      { jwt, ttl: 300 }, // 5-minute widget session
      { headers, withCredentials: true } // Include cookies
    ).pipe(
      map(response => {
        if (response.success) {
          console.log('[DPaC Widget] Session created for user:', response.user_id);
        }
        return response;
      }),
      catchError(error => {
        console.error('[DPaC Widget] Session creation failed:', error);
        return of({
          success: false,
          error: error.status === 401 
            ? 'JWT expired. Please refresh the page.' 
            : `HTTP ${error.status}: ${error.message}`
        });
      })
    );
  }

  /**
   * Call this before opening the widget.
   */
  async openWidgetWithSession(): Promise<boolean> {
    return new Promise((resolve) => {
      this.initWidgetSession().subscribe(response => {
        if (response.success) {
          // Session is ready, widget can now be opened
          resolve(true);
        } else {
          // Handle error - show toast or redirect to login
          console.error('Widget session failed:', response.error);
          resolve(false);
        }
      });
    });
  }
}
```

#### 4.5.2 Usage in Component

```typescript
// src/app/components/dpac-widget/dpac-widget.component.ts
import { Component } from '@angular/core';
import { DpacWidgetAuthService } from '../../services/dpac-widget-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-dpac-widget',
  template: `
    <button (click)="openWidget()" [disabled]="isLoading">
      {{ isLoading ? 'Caricamento...' : 'Apri Assistente D.PaC' }}
    </button>
  `
})
export class DpacWidgetComponent {
  isLoading = false;

  constructor(
    private widgetAuth: DpacWidgetAuthService,
    private snackBar: MatSnackBar
  ) {}

  async openWidget(): Promise<void> {
    this.isLoading = true;
    
    const success = await this.widgetAuth.openWidgetWithSession();
    
    if (success) {
      // Show the widget iframe
      this.showWidgetIframe();
    } else {
      this.snackBar.open(
        'Sessione scaduta. Effettua nuovamente il login.',
        'OK',
        { duration: 5000 }
      );
    }
    
    this.isLoading = false;
  }

  private showWidgetIframe(): void {
    const modal = document.getElementById('dpac-modal');
    const backdrop = document.getElementById('dpac-backdrop');
    if (modal) modal.style.display = 'block';
    if (backdrop) backdrop.style.display = 'block';
  }
}
```

#### 4.5.3 Vanilla JavaScript (Alternative)

```javascript
// dpac-widget-auth.js

/**
 * Get the existing DPaC JWT from the portal.
 * This is the same token issued by WSO2 at login.
 */
function getExistingDpacJwt() {
  // Common storage locations in DLWEB
  return localStorage.getItem('access_token') 
      || sessionStorage.getItem('access_token');
}

/**
 * Initialize widget session using the existing portal JWT.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function initDpacWidgetSession() {
  const jwt = getExistingDpacJwt();
  
  if (!jwt) {
    return { 
      success: false, 
      error: 'Utente non autenticato. Accedere al portale DPaC.' 
    };
  }

  try {
    const response = await fetch('/dpac/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      },
      credentials: 'include', // Required for cookie setting
      body: JSON.stringify({ jwt, ttl: 300 })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { 
        success: false, 
        error: data.error || `Errore HTTP ${response.status}` 
      };
    }
    
    console.log('[DPaC Widget] Session created:', data.session_id);
    return data;
    
  } catch (error) {
    return { 
      success: false, 
      error: 'Errore di connessione. Riprovare.' 
    };
  }
}

/**
 * Open widget with automatic session initialization.
 */
async function openDpacWidget() {
  const result = await initDpacWidgetSession();
  
  if (!result.success) {
    // Show error to user
    alert(result.error);
    return;
  }
  
  // Session ready - show widget
  document.getElementById('dpac-modal').style.display = 'block';
  document.getElementById('dpac-backdrop').style.display = 'block';
}

// Attach to global for easy access
window.DpacWidget = { open: openDpacWidget };
```

#### 4.5.4 JWT Validation Flow (Widget Backend)

The widget backend performs these validation steps:

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   DLWEB     │────►│  Widget Backend │────►│   WSO2      │
│  (Portal)   │     │  /dpac/session  │     │ (Validate)  │
└─────────────┘     └─────────────────┘     └─────────────┘
       │                    │                      │
       │ 1. POST JWT        │                      │
       │───────────────────►│                      │
       │                    │                      │
       │                    │ 2. Verify signature  │
       │                    │    using WSO2 JWKS   │
       │                    │─────────────────────►│
       │                    │                      │
       │                    │ 3. Check claims:     │
       │                    │    - iss matches     │
       │                    │    - exp not expired │
       │                    │    - sub present     │
       │                    │◄─────────────────────│
       │                    │                      │
       │                    │ 4. Extract user:     │
       │                    │    LDAP: email       │
       │                    │    SPID: fiscalNumber│
       │                    │                      │
       │                    │ 5. Create session    │
       │                    │    Set HttpOnly      │
       │                    │    cookie            │
       │                    │                      │
       │ 6. Response +      │                      │
       │    Set-Cookie      │                      │
       │◄───────────────────│                      │
```

### 4.6 SSE Streaming (To Be Implemented)

Once the `/chat/stream` endpoint is implemented:

```typescript
// dpac-streaming.ts
interface StreamEvent {
  token?: string;
  done?: boolean;
  error?: string;
  metadata?: {
    sources?: string[];
    confidence?: number;
  };
}

type StreamCallback = {
  onToken: (fullText: string) => void;
  onComplete: (metadata?: StreamEvent['metadata']) => void;
  onError: (error: string) => void;
};

function streamChatResponse(
  question: string,
  files: string[],
  callbacks: StreamCallback
): () => void {
  const params = new URLSearchParams({
    question,
    files: JSON.stringify(files),
    domain_id: 'dpac',
    language: 'it',
  });
  
  const eventSource = new EventSource(`/chat/stream?${params}`);
  let fullResponse = '';
  
  eventSource.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data);
      
      if (data.error) {
        callbacks.onError(data.error);
        eventSource.close();
        return;
      }
      
      if (data.done) {
        callbacks.onComplete(data.metadata);
        eventSource.close();
        return;
      }
      
      if (data.token) {
        fullResponse += data.token;
        callbacks.onToken(fullResponse);
      }
    } catch {
      // Plain text token fallback
      fullResponse += event.data;
      callbacks.onToken(fullResponse);
    }
  };
  
  eventSource.onerror = () => {
    callbacks.onError('Connessione persa. Riprova.');
    eventSource.close();
  };
  
  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

// React hook for streaming
function useStreamChat() {
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  
  const startStream = useCallback((question: string, files: string[]) => {
    // Cleanup previous stream
    cleanupRef.current?.();
    
    setIsStreaming(true);
    setResponse('');
    setError(null);
    
    cleanupRef.current = streamChatResponse(question, files, {
      onToken: setResponse,
      onComplete: () => setIsStreaming(false),
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }, []);
  
  const stopStream = useCallback(() => {
    cleanupRef.current?.();
    setIsStreaming(false);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => () => cleanupRef.current?.(), []);
  
  return { response, isStreaming, error, startStream, stopStream };
}
```

---

## 5. Hosting & Operations Guide

### 5.1 Direct URL Test (Diagnosis)

**Step 1: Test widget directly in browser**

```bash
# Test launcher
curl -I http://your-server:3000/dpac/launcher
# Expected: HTTP 200

# Test modal
curl -I http://your-server:3000/dpac/modal
# Expected: HTTP 200

# Test API
curl http://your-server:3000/api/minio/test
# Expected: JSON with MinIO connection status
```

**Step 2: Open in browser**

Navigate to `http://your-server:3000/dpac/launcher` directly (not in iframe).

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Login page appears | Server auth intercepting all routes | Whitelist `/dpac/*` in auth middleware |
| 404 error | Next.js not running | Check PM2: `pm2 status dpac-widget` |
| CORS error | Missing headers | Add Nginx CORS config |
| Blank page | JS error | Check browser console |
| Connection refused | Port blocked | Check Azure NSG / firewall |

### 5.2 Nginx Configuration

#### 5.2.1 Same-Origin Setup (Recommended)

```nginx
# /etc/nginx/sites-available/dpac-widget
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate     /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # ===========================================
    # HOST APPLICATION (Angular/React)
    # ===========================================
    location / {
        proxy_pass http://localhost:4200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # ===========================================
    # DPAC WIDGET ROUTES
    # ===========================================
    location /dpac/ {
        proxy_pass http://localhost:3000/dpac/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Cookie handling for same-origin
        proxy_cookie_path / /;
    }
    
    # ===========================================
    # DPAC API ROUTES
    # ===========================================
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long requests
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
    
    # ===========================================
    # STATIC ASSETS
    # ===========================================
    location /dpac-embed/ {
        proxy_pass http://localhost:3000/dpac-embed/;
        proxy_cache_valid 200 1d;
        add_header Cache-Control "public, max-age=86400";
    }
    
    # ===========================================
    # SSE STREAMING (When implemented)
    # ===========================================
    location /chat/stream {
        proxy_pass http://localhost:3000/chat/stream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        
        # CRITICAL: Disable buffering for SSE
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        
        # Long timeout for streaming
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        
        # SSE-specific headers
        add_header Content-Type "text/event-stream" always;
        add_header Cache-Control "no-cache, no-transform" always;
        add_header X-Accel-Buffering "no" always;
    }
}
```

#### 5.2.2 Cross-Origin Setup (iframe from different domain)

Add these modifications for cross-origin cookie support:

```nginx
location /dpac/ {
    # ... existing config ...
    
    # CORS Headers
    add_header 'Access-Control-Allow-Origin' 'https://host-app-domain.com' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
    
    # Handle preflight
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' 'https://host-app-domain.com';
        add_header 'Access-Control-Allow-Credentials' 'true';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With';
        add_header 'Content-Length' 0;
        add_header 'Content-Type' 'text/plain';
        return 204;
    }
    
    # Cookie modification for cross-site
    proxy_cookie_flags ~ SameSite=None Secure;
}
```

### 5.3 PM2 Process Management

```bash
# Install PM2 globally
npm install -g pm2

# Start the widget
cd /path/to/dpac-widget
npm run build
pm2 start npm --name "dpac-widget" -- start

# View logs
pm2 logs dpac-widget

# Monitor
pm2 monit

# Save configuration
pm2 save

# Setup startup script
pm2 startup

# Restart on code update
pm2 restart dpac-widget

# View status
pm2 status
```

### 5.4 Environment Variables

Create `.env.local` in the widget root:

```bash
# ============================================
# MinIO Configuration
# ============================================
MINIO_ENDPOINT=72.146.30.121
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=dpac

# ============================================
# Backend API (inference)
# ============================================
BACKEND_API_URL=http://72.146.30.121:8002

# ============================================
# DPaC Platform / WSO2 Configuration
# ============================================
# WSO2 Identity Provider - Issuer URI (must match 'iss' claim in JWT)
# Production
WSO2_ISSUER_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery
# Staging (use this for collaudo/preprod)
# WSO2_ISSUER_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery

# JWKS endpoint for JWT signature validation
WSO2_JWKS_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/jwks
# Staging
# WSO2_JWKS_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/jwks

# Expected JWT audience (client ID)
WSO2_AUDIENCE=7wA7F6URmZEArFkPOfqBijd63dQa

# ============================================
# DPaC Microservices (internal calls)
# ============================================
# MICDL-SERVER URL (for backend-to-backend calls)
MICDL_SERVER_URL=http://micdl-server:8080
# MICDL-CORE URL (for session/user context)
MICDL_CORE_URL=http://micdl-core:8080

# ============================================
# Session Configuration
# ============================================
SESSION_SECRET=your-random-secret-min-32-chars
SESSION_TTL=300
# Redis for session storage (align with MICDL-CORE)
REDIS_URL=redis://localhost:6379

# ============================================
# CORS (comma-separated list of allowed origins)
# ============================================
ALLOWED_ORIGINS=https://your-domain.com,https://staging.your-domain.com

# ============================================
# Spring Boot Profile (align with DPaC)
# ============================================
# Options: local, preprod, prod
SPRING_PROFILES_ACTIVE=local
```

#### Environment Profiles (DPaC Alignment)

| Profile | WSO2 Issuer | OpenShift Cluster |
|---------|-------------|-------------------|
| `local` | Staging URI | N/A (local dev) |
| `preprod` | Staging URI | `apps.os01.ocp.cineca.it` |
| `prod` | Production URI | Production cluster |

### 5.5 Azure Configuration

#### Azure NSG Rules

| Priority | Name | Port | Protocol | Source | Action |
|----------|------|------|----------|--------|--------|
| 100 | AllowHTTPS | 443 | TCP | Any | Allow |
| 110 | AllowHTTP | 80 | TCP | Any | Allow |
| 120 | AllowWidget | 3000 | TCP | VirtualNetwork | Allow |
| 130 | AllowMinIO | 9000 | TCP | VirtualNetwork | Allow |
| 140 | AllowBackend | 8002 | TCP | VirtualNetwork | Allow |

#### Azure App Service (Alternative)

```bash
# Create App Service
az webapp create \
  --resource-group dpac-rg \
  --plan dpac-plan \
  --name dpac-widget \
  --runtime "NODE:18-lts"

# Configure environment variables
az webapp config appsettings set \
  --resource-group dpac-rg \
  --name dpac-widget \
  --settings \
    MINIO_ENDPOINT="72.146.30.121" \
    MINIO_PORT="9000" \
    MINIO_ACCESS_KEY="xxx" \
    MINIO_SECRET_KEY="xxx"

# Deploy
az webapp deployment source config-local-git \
  --resource-group dpac-rg \
  --name dpac-widget

git remote add azure <deployment-url>
git push azure main
```

### 5.6 Health Checks

Add this endpoint to the widget (to be implemented):

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      widget: 'ok',
      minio: 'pending',
      backend: 'pending',
    },
  };
  
  // Check MinIO
  try {
    const minioRes = await fetch('http://localhost:3000/api/minio/test');
    const minioData = await minioRes.json();
    checks.checks.minio = minioData.success ? 'ok' : 'error';
  } catch {
    checks.checks.minio = 'error';
  }
  
  // Check Backend
  try {
    const backendRes = await fetch('http://72.146.30.121:8002/health', {
      signal: AbortSignal.timeout(5000),
    });
    checks.checks.backend = backendRes.ok ? 'ok' : 'error';
  } catch {
    checks.checks.backend = 'error';
  }
  
  const allOk = Object.values(checks.checks).every(v => v === 'ok');
  checks.status = allOk ? 'ok' : 'degraded';
  
  return NextResponse.json(checks, {
    status: allOk ? 200 : 503,
  });
}
```

### 5.7 Logging & Monitoring

#### Log Patterns to Monitor

```bash
# Nginx access logs
tail -f /var/log/nginx/access.log | grep -E '/dpac|/api'

# PM2 logs
pm2 logs dpac-widget --lines 100

# Search for errors
grep -E "ERROR|error|500|502|503" /var/log/nginx/error.log
```

#### Recommended Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `dpac_widget_load_time_ms` | Time from open to loaded event | > 5000ms |
| `dpac_api_latency_ms` | API response time | > 2000ms |
| `dpac_session_failures` | Failed session creations | > 5% |
| `dpac_stream_disconnects` | SSE disconnections | > 10% |
| `dpac_minio_errors` | MinIO connection errors | > 0 |

---

## 6. API Reference

### 6.1 POST /api/chat

Proxy to vector inference backend.

**Request:**

```json
{
  "question": "Come funziona il processo di approvazione?",
  "files": ["project1/doc1.pdf", "project1/doc2.pdf"],
  "domain_id": "dpac",
  "language": "it",
  "session_id": "optional_session_id",
  "user_id": "optional_user_id"
}
```

**Response (Success):**

```json
{
  "answer": "Il processo di approvazione prevede i seguenti passaggi...",
  "sources": [
    {
      "file": "project1/doc1.pdf",
      "page": 12,
      "relevance": 0.92
    }
  ]
}
```

**Response (Async Workflow):**

```json
{
  "workflow_id": "wf_123456",
  "tasks": ["task1", "task2"],
  "status": "processing"
}
```

### 6.2 GET /api/minio/folders

List folders in MinIO bucket.

**Query Parameters:**
- `bucket` (optional): Bucket name, default "dpac"

**Response:**

```json
{
  "success": true,
  "bucket": "dpac",
  "folders": [
    { "name": "Project1", "prefix": "Project1/" },
    { "name": "Project2", "prefix": "Project2/" }
  ]
}
```

### 6.3 GET /api/minio/files

List files in a folder.

**Query Parameters:**
- `bucket` (optional): Bucket name, default "dpac"
- `folder` (required): Folder name

**Response:**

```json
{
  "success": true,
  "bucket": "dpac",
  "folder": "Project1",
  "files": [
    {
      "name": "document.pdf",
      "fullPath": "Project1/document.pdf",
      "size": 1024567,
      "lastModified": "2025-11-28T10:30:00Z"
    }
  ]
}
```

### 6.4 POST /dpac/session ✅ Implemented

Create authenticated session using the existing DPaC Portal JWT.

> **Key**: This endpoint accepts the same JWT already used by DLWEB (issued by WSO2). No new authentication required.
>
> **Documentation**: See [docs/AUTHENTICATION_SECURITY.md](./docs/AUTHENTICATION_SECURITY.md) for detailed implementation guide.

**Request:**

```http
POST /dpac/session HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...

{
  "jwt": "eyJhbGciOiJSUzI1NiIs...",
  "ttl": 300
}
```

**Response (Success):**

```json
{
  "success": true,
  "session_id": "sess_abc123",
  "expires_at": "2025-11-28T11:00:00Z",
  "user_id": "stefano.solli@cultura.gov.it",
  "auth_type": "LDAP"
}
```

**Response (SPID User Success):**

```json
{
  "success": true,
  "session_id": "sess_def456",
  "expires_at": "2025-11-28T11:00:00Z",
  "user_id": "SPID-002TINIT-LVLDAA85T50G702B",
  "fiscal_number": "TINIT-LVLDAA85T50G702B",
  "auth_type": "SPID"
}
```

**Response (Failure - Expired Token):**

```json
{
  "success": false,
  "error": "JWT expired",
  "error_code": "TOKEN_EXPIRED"
}
```

**Response (Failure - Invalid Issuer):**

```json
{
  "success": false,
  "error": "JWT issuer not trusted",
  "error_code": "INVALID_ISSUER",
  "expected_issuer": "https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery"
}
```

**Side Effects:**
- Sets `HttpOnly` cookie: `dpac_session=sess_abc123; Secure; SameSite=None; Path=/dpac; Max-Age=300`

**Validation Steps (Widget Backend):**

1. **Extract JWT** from Authorization header or request body
2. **Fetch JWKS** from WSO2: `{issuer}/.well-known/jwks.json`
3. **Verify signature** using RSA public key from JWKS
4. **Validate claims:**
   - `iss` matches configured WSO2 issuer
   - `exp` > current timestamp
   - `sub` is present
5. **Identify user type:**
   - If `fiscalNumber` present → SPID user
   - If `email` present → LDAP user
6. **Create session** in Redis (or in-memory)
7. **Set cookie** and return response

**Environment Configuration:**

```bash
# WSO2 Issuer URIs (match the 'iss' claim in JWT)
WSO2_ISSUER_URI_PROD=https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery
WSO2_ISSUER_URI_STAGING=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery

# JWKS endpoints (for signature validation)
WSO2_JWKS_URI_PROD=https://identity.cloud.sbn.it/t/ispc.it/oauth2/jwks
WSO2_JWKS_URI_STAGING=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/jwks
```

### 6.5 GET /chat/stream ✅ Implemented

SSE endpoint for streaming responses.

**Query Parameters:**
- `question`: User question
- `files`: JSON array of file paths
- `domain_id`: Domain/bucket
- `language`: Response language

**Response (SSE):**

```
event: message
data: {"token": "Il "}

event: message
data: {"token": "processo "}

event: message
data: {"token": "prevede..."}

event: message
data: {"done": true, "metadata": {"sources": ["doc1.pdf"]}}
```

---

## 7. Widget Events Reference

### 7.1 Events Emitted by Widget

| Event Type | Payload | Description |
|------------|---------|-------------|
| `dpac.widget.loaded` | `{ source: "launcher" \| "modal" \| "sourcePicker" \| "fileSelect" }` | Iframe finished loading |
| `dpac.widget.open` | — | User clicked launcher to open chat |
| `dpac.widget.close` | — | User requested to close widget |
| `dpac.widget.openSourcePicker` | — | User clicked "Fonte" button |
| `dpac.widget.closeSourcePicker` | — | User closed source picker |
| `dpac.widget.openFileSelect` | `{ projects: string[] }` | User confirmed sources, opening file select |
| `dpac.widget.closeFileSelect` | — | User closed file select |
| `dpac.widget.filesSelected` | `{ files: string[] }` | User confirmed file selection |

### 7.2 Events to Be Implemented

| Event Type | Payload | Description |
|------------|---------|-------------|
| `dpac.widget.ready` | `{ authenticated: boolean }` | Widget fully ready (auth complete) |
| `dpac.widget.error` | `{ code: string, message: string }` | Error occurred |
| `dpac.auth` | `{ status: "ok" \| "fail", reason?: string }` | Authentication result |

### 7.3 Event Flow Diagram

```
Host App                          Widget (iframe)
   │                                    │
   │  ◄─────── dpac.widget.loaded ──────│  (launcher ready)
   │                                    │
   │  [User clicks launcher]            │
   │  ◄─────── dpac.widget.open ────────│
   │                                    │
   │  [Show modal iframe]               │
   │  ◄─────── dpac.widget.loaded ──────│  (modal ready)
   │                                    │
   │  [User clicks "Fonte"]             │
   │  ◄── dpac.widget.openSourcePicker ─│
   │                                    │
   │  [Show source picker iframe]       │
   │  ◄─────── dpac.widget.loaded ──────│  (sourcePicker ready)
   │                                    │
   │  [User selects sources & confirms] │
   │  ◄── dpac.widget.openFileSelect ───│  { projects: [...] }
   │                                    │
   │  [Forward to file-select iframe]   │
   │  ───── dpac.widget.openFileSelect ─►│
   │                                    │
   │  [User selects files & confirms]   │
   │  ◄─── dpac.widget.filesSelected ───│  { files: [...] }
   │                                    │
   │  [Forward to chat iframe]          │
   │  ──── dpac.widget.filesSelected ───►│
   │                                    │
   │  [User clicks X or ESC]            │
   │  ◄────── dpac.widget.close ────────│
   │                                    │
   │  [Hide all modals]                 │
   │                                    │
```

---

## 8. Security Considerations

### 8.1 Current Security Status

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| JWT validation | **HIGH** | ✅ Fixed | WSO2 JWKS validation implemented in `/dpac/session` |
| Session cookies | **HIGH** | ✅ Fixed | HttpOnly, Secure, SameSite=None cookies |
| User type detection | **HIGH** | ✅ Fixed | LDAP (email) and SPID (fiscalNumber) supported |
| postMessage uses `"*"` | **MEDIUM** | ⚠️ Pending | Replace with specific origin |
| MinIO creds in env | **MEDIUM** | ✅ OK | Using env vars, `.env` is gitignored |
| Backend endpoint open | **MEDIUM** | ⚠️ Review | `http://72.146.30.121:8002` - restrict to internal network |
| CSRF protection | **LOW** | ⚠️ Pending | Consider adding CSRF tokens |

### 8.1.1 DPaC-Specific Security Requirements

The widget must align with DPaC platform security standards:

| Requirement | Implementation |
|-------------|----------------|
| **WSO2 JWT Validation** | Validate `iss` claim against configured WSO2 issuer URI |
| **JWKS Signature Verification** | Fetch public keys from WSO2 JWKS endpoint |
| **User Identification** | Extract `fiscalNumber` (SPID) or `email` (LDAP) |
| **Role-Based Access** | Respect DPaC roles (ROP, PM, BM, PO, APPLICATION_USER) |
| **Header Forwarding** | Forward `Authorization` header to DPaC microservices |
| **OpenShift Integration** | Follow Spring Boot profile conventions (local/preprod/prod) |

### 8.2 Calling DPaC Microservices (Widget Backend)

If the widget needs to call other DPaC microservices (e.g., MICDL-SERVER, MICDL-CORE), it must forward the JWT:

```typescript
// Example: Calling MICDL-SERVER from widget backend
async function callDpacMicroservice(
  endpoint: string,
  sessionJwt: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${sessionJwt}`,
    'X-Auth-Token': sessionJwt, // Some services use this header
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  // Use internal OpenShift service URL
  const baseUrl = process.env.MICDL_SERVER_URL 
    || 'http://micdl-server:8080'; // Internal k8s service name

  return fetch(`${baseUrl}${endpoint}`, options);
}

// Example: Get user info from MICDL-CORE
async function getUserContext(jwt: string) {
  const response = await callDpacMicroservice(
    '/session/getUserInfo',
    jwt
  );
  
  if (!response.ok) {
    throw new Error(`Failed to get user context: ${response.status}`);
  }
  
  return response.json();
  // Returns: { user, cantiere, roles, ... }
}
```

**Important Headers for DPaC Microservices:**

| Header | Purpose | Required |
|--------|---------|----------|
| `Authorization: Bearer <JWT>` | Primary authentication | ✅ Yes |
| `X-Auth-Token: <JWT>` | Alternative auth (some services) | Sometimes |
| `Content-Type: application/json` | Request body format | For POST |
| `Accept: application/json` | Response format | Recommended |

### 8.3 postMessage Security Fix

Replace all instances of:

```typescript
// INSECURE - Current code
window.parent.postMessage({ type: "dpac.widget.open" }, "*");
```

With:

```typescript
// SECURE - Fixed code
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://staging.your-domain.com',
];

function safePostMessage(message: object): void {
  const targetOrigin = document.referrer 
    ? new URL(document.referrer).origin 
    : '*';
  
  // Only send if origin is allowed
  if (targetOrigin === '*' || ALLOWED_ORIGINS.includes(targetOrigin)) {
    window.parent.postMessage(message, targetOrigin);
  } else {
    console.warn('[DPaC] Blocked postMessage to untrusted origin:', targetOrigin);
  }
}

// Usage
safePostMessage({ type: "dpac.widget.open" });
```

### 8.3 Cookie Security

For cross-origin iframe cookies to work:

```typescript
// In /dpac/session endpoint (to be implemented)
import { cookies } from 'next/headers';

cookies().set('dpac_session', sessionId, {
  httpOnly: true,       // Not accessible via JavaScript
  secure: true,         // HTTPS only (required for SameSite=None)
  sameSite: 'none',     // Required for cross-origin iframe
  path: '/dpac',        // Scope to widget routes only
  maxAge: 300,          // 5 minutes
});
```

### 8.4 CORS Configuration

Add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || 'https://your-domain.com',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Authorization, Content-Type, X-Requested-With',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
      {
        source: '/dpac/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

---

## 9. Troubleshooting

### 9.0 DPaC-Specific Issues

#### 401 Unauthorized from Widget

**Symptoms:** API calls return 401, widget shows "Sessione scaduta"

**Diagnosis:**
1. Check browser DevTools → Network → look for the failing request
2. Inspect the JWT in localStorage: `JSON.parse(atob(localStorage.getItem('access_token').split('.')[1]))`
3. Check if `exp` (expiration) is in the past

**Common Causes:**
- JWT expired (check `exp` claim)
- WSO2 issuer URI mismatch (check `iss` claim matches widget config)
- JWKS endpoint unreachable

**Fix:**
```javascript
// Check JWT expiration
const jwt = localStorage.getItem('access_token');
const payload = JSON.parse(atob(jwt.split('.')[1]));
const expiresAt = new Date(payload.exp * 1000);
console.log('Token expires:', expiresAt, 'Expired:', expiresAt < new Date());

// Expected issuer URIs:
// Production: https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery
// Staging: https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery
console.log('Token issuer:', payload.iss);
```

#### 403 Forbidden from Widget

**Symptoms:** Session creates successfully, but API calls return 403

**Diagnosis:**
1. Check if user has required roles in the JWT
2. Verify MICDL-CORE `/session/getUserInfo` returns the user

**Common Causes:**
- User lacks `APPLICATION_USER` role
- User not assigned to any "Cantiere" (project site)
- Role-based access control blocking the resource

**Fix:**
- Contact DPaC administrator to assign proper roles
- Check roles claim in JWT: `payload.roles` or check in DPaC user management

#### WSO2 Issuer Mismatch

**Symptoms:** Widget returns "JWT issuer not trusted"

**Diagnosis:**
```bash
# Check configured issuer in widget
echo $WSO2_ISSUER_URI_PROD

# Check actual issuer in token (browser console)
const jwt = localStorage.getItem('access_token');
console.log('iss:', JSON.parse(atob(jwt.split('.')[1])).iss);
```

**Fix:**
Update widget environment to match the correct issuer:
```bash
# Production
WSO2_ISSUER_URI_PROD=https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery

# Staging/Collaudo
WSO2_ISSUER_URI_STAGING=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery
```

#### SPID vs LDAP User Identification

**Symptoms:** User not recognized correctly, roles missing

**Diagnosis:**
```javascript
const jwt = localStorage.getItem('access_token');
const payload = JSON.parse(atob(jwt.split('.')[1]));

if (payload.fiscalNumber) {
  console.log('SPID User:', payload.fiscalNumber);
  console.log('Name:', payload.given_name, payload.family_name);
} else if (payload.email) {
  console.log('LDAP User:', payload.email);
}
```

**Fix:**
Widget backend must handle both user types:
```typescript
function extractUserId(jwtPayload: JwtPayload): string {
  // SPID users have fiscalNumber
  if (jwtPayload.fiscalNumber) {
    return jwtPayload.fiscalNumber;
  }
  // LDAP users have email
  if (jwtPayload.email) {
    return jwtPayload.email;
  }
  // Fallback to sub claim
  return jwtPayload.sub;
}
```

### 9.1 Common Issues

#### Widget doesn't open

**Symptoms:** Clicking launcher does nothing

**Diagnosis:**
1. Open browser console
2. Look for `[DPaC]` logs
3. Check for postMessage errors

**Common causes:**
- Origin mismatch in message handler
- JavaScript error in host page
- iframe not loaded

**Fix:**
```javascript
// Add debug logging
window.addEventListener('message', (e) => {
  console.log('Message received:', e.origin, e.data);
});
```

#### Login page appears in widget

**Symptoms:** Widget shows host app login instead of chat

**Diagnosis:**
1. Open `http://server:3000/dpac/launcher` directly in browser
2. If login appears, it's a server-side issue

**Common causes:**
- Auth middleware intercepting `/dpac/*` routes
- Session cookie not being set correctly
- Different auth realms

**Fix:**
- Whitelist `/dpac/*` in auth configuration
- Or implement `/dpac/session` for JWT handoff

#### Cookies not working in iframe

**Symptoms:** Session lost after page refresh, or 401 errors

**Diagnosis:**
1. Open DevTools > Application > Cookies
2. Check if `dpac_session` cookie exists
3. Check cookie attributes

**Common causes:**
- `SameSite=Lax` blocking cross-origin cookies
- Missing `Secure` flag with `SameSite=None`
- Third-party cookie blocking (Safari, Firefox strict mode)

**Fix:**
```nginx
# In Nginx
proxy_cookie_flags ~ SameSite=None Secure;
```

#### SSE not streaming (when implemented)

**Symptoms:** Response appears all at once instead of streaming

**Diagnosis:**
1. Check Network tab for `/chat/stream` request
2. Verify `Content-Type: text/event-stream`
3. Check for buffering indicators

**Common causes:**
- Nginx buffering enabled
- Reverse proxy caching
- Missing `X-Accel-Buffering: no` header

**Fix:**
```nginx
location /chat/stream {
  proxy_buffering off;
  proxy_cache off;
  add_header X-Accel-Buffering "no";
}
```

### 9.2 Debug Mode

Enable debug mode in host script:

```javascript
const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log('[DPaC Host]', new Date().toISOString(), ...args);
  }
}
```

### 9.3 Support Checklist

When reporting issues, include:

- [ ] Browser and version
- [ ] Host app URL
- [ ] Widget URL
- [ ] Browser console logs (filtered for `DPaC`)
- [ ] Network tab screenshot
- [ ] PM2 logs (`pm2 logs dpac-widget --lines 50`)
- [ ] Nginx error logs (`tail -50 /var/log/nginx/error.log`)

---

## 10. Development Responsibilities

This section clearly outlines what needs to be developed by each team:
- **Widget Team**: Developers working on this codebase (`dpac-widget-main`)
- **Portal Developers**: Teams integrating the widget into their host applications

---

### 10.1 🔧 WIDGET CODEBASE (This Repository)

> **Owner**: D.PaC Widget Team (Zakaria, Hamid)
> **Repository**: `dpac-widget-main`

These are the features and fixes that need to be implemented **in this widget codebase**.

#### 10.1.1 API Endpoints (Backend)

| Endpoint | Priority | Status | Description |
|----------|----------|--------|-------------|
| `POST /dpac/session` | **HIGH** | ✅ Done | JWT validation & session cookie creation |
| `GET /chat/stream` | **HIGH** | ✅ Done | SSE streaming for real-time responses |
| `GET /api/chat/poll` | **HIGH** | ✅ Done | Celery/Flower polling for async responses |
| `GET /api/health` | **MEDIUM** | ✅ Done | Health check for monitoring |

**`POST /dpac/session` Requirements (DPaC-Specific):**
- [ ] Accept existing DPaC JWT from Authorization header or request body
- [ ] Fetch JWKS from WSO2: `{WSO2_ISSUER_URI}/.well-known/jwks.json`
- [ ] Validate JWT signature using RSA public key from JWKS
- [ ] Validate `iss` claim matches configured WSO2 issuer URI:
  - Production: `https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery`
  - Staging: `https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery`
- [ ] Validate JWT expiry (`exp` claim not in the past)
- [ ] Extract user identity:
  - SPID users: `fiscalNumber` (e.g., `TINIT-LVLDAA85T50G702B`)
  - LDAP users: `email` (e.g., `stefano.solli@cultura.gov.it`)
- [ ] Extract roles from `roles` claim if present
- [ ] Generate unique session ID and store in Redis
- [ ] Set HttpOnly cookie: `dpac_session=<session_id>; Secure; SameSite=None; Path=/dpac; Max-Age=300`
- [ ] Return JSON: `{ success: true, session_id, expires_at, user_id, auth_type }`

**`GET /chat/stream` Requirements:**
- [ ] Accept query params: `question`, `files`, `domain_id`, `language`
- [ ] Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- [ ] Stream tokens incrementally: `data: {"token": "word "}\n\n`
- [ ] Send completion: `data: {"done": true, "metadata": {...}}\n\n`
- [ ] Handle errors gracefully: `data: {"error": "message"}\n\n`

#### 10.1.2 Widget Components (Frontend - Must Implement)

| Component | Priority | Status | Description |
|-----------|----------|--------|-------------|
| SSE Consumer | **HIGH** | ❌ TODO | Real-time streaming in ChatCard |
| Login Modal | **MEDIUM** | ❌ TODO | Fallback when session fails |
| Error Handling | **MEDIUM** | ❌ TODO | Graceful error states |

**ChatCard SSE Integration:**
- [ ] Replace current `/api/chat` POST with `/chat/stream` SSE connection
- [ ] Display tokens as they arrive (typewriter effect)
- [ ] Show loading indicator during streaming
- [ ] Handle stream errors and disconnections
- [ ] Allow cancellation of ongoing stream

**Login Modal Fallback:**
- [ ] Create in-widget login form
- [ ] Display when session creation fails
- [ ] Support username/password authentication
- [ ] Emit `dpac.auth` event on success/failure

#### 10.1.3 Widget Events (Must Implement)

| Event | Direction | Status | Description |
|-------|-----------|--------|-------------|
| `dpac.widget.ready` | Widget → Host | ❌ TODO | Widget fully initialized (auth complete) |
| `dpac.widget.error` | Widget → Host | ❌ TODO | Error occurred in widget |
| `dpac.auth` | Widget → Host | ❌ TODO | Authentication result |

**Event Implementation:**
- [ ] Emit `dpac.widget.ready` after successful session validation
- [ ] Emit `dpac.widget.error` with `{ code, message }` on failures
- [ ] Emit `dpac.auth` with `{ status: "ok" | "fail", reason? }`

#### 10.1.4 Security Fixes

| Issue | Priority | Status | Description |
|-------|----------|--------|-------------|
| WSO2 JWT validation | **HIGH** | ✅ Done | Validate JWT against WSO2 issuer |
| Session cookie security | **HIGH** | ✅ Done | HttpOnly, Secure, SameSite=None |
| postMessage origin | **MEDIUM** | ⚠️ Pending | Replace `"*"` with specific origin |
| CORS headers | **MEDIUM** | ⚠️ Pending | Add proper CORS in next.config.js |
| Input validation | **MEDIUM** | ⚠️ Pending | Validate all API inputs |

**WSO2 JWT Validation Implementation (Widget Backend):**

```typescript
// src/lib/dpac-auth.ts
import * as jose from 'jose';

interface DpacJwtPayload {
  sub: string;
  iss: string;
  exp: number;
  iat?: number;
  // LDAP users
  email?: string;
  roles?: string;
  // SPID users
  fiscalNumber?: string;
  given_name?: string;
  family_name?: string;
}

interface ValidationResult {
  valid: boolean;
  payload?: DpacJwtPayload;
  userId?: string;
  authType?: 'LDAP' | 'SPID';
  error?: string;
}

// Trusted WSO2 issuers
const TRUSTED_ISSUERS = [
  process.env.WSO2_ISSUER_URI,
  'https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery',
  'https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery',
].filter(Boolean);

// Cache for JWKS to avoid repeated fetches
let jwksCache: jose.JWTVerifyGetKey | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour

async function getJwks(issuer: string): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  
  if (jwksCache && (now - jwksCacheTime) < JWKS_CACHE_TTL) {
    return jwksCache;
  }
  
  const jwksUri = `${issuer}/.well-known/jwks.json`;
  jwksCache = jose.createRemoteJWKSet(new URL(jwksUri));
  jwksCacheTime = now;
  
  return jwksCache;
}

export async function validateDpacJwt(token: string): Promise<ValidationResult> {
  try {
    // 1. Decode header to get issuer (without verification)
    const decoded = jose.decodeJwt(token) as DpacJwtPayload;
    
    // 2. Verify issuer is trusted
    if (!TRUSTED_ISSUERS.includes(decoded.iss)) {
      return {
        valid: false,
        error: `Untrusted issuer: ${decoded.iss}`,
      };
    }
    
    // 3. Get JWKS for the issuer
    const jwks = await getJwks(decoded.iss);
    
    // 4. Verify signature and claims
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: decoded.iss,
      clockTolerance: 60, // 1 minute tolerance
    });
    
    const jwtPayload = payload as unknown as DpacJwtPayload;
    
    // 5. Determine user type and ID
    let userId: string;
    let authType: 'LDAP' | 'SPID';
    
    if (jwtPayload.fiscalNumber) {
      // SPID user
      userId = jwtPayload.fiscalNumber;
      authType = 'SPID';
    } else if (jwtPayload.email) {
      // LDAP user
      userId = jwtPayload.email;
      authType = 'LDAP';
    } else {
      // Fallback to sub
      userId = jwtPayload.sub;
      authType = 'LDAP';
    }
    
    return {
      valid: true,
      payload: jwtPayload,
      userId,
      authType,
    };
    
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return { valid: false, error: 'JWT expired' };
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return { valid: false, error: 'Invalid JWT signature' };
    }
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Usage in /dpac/session route:
// const result = await validateDpacJwt(request.body.jwt);
// if (!result.valid) {
//   return Response.json({ success: false, error: result.error }, { status: 401 });
// }
// // Create session with result.userId and result.authType
```

**postMessage Security Fix:**
```typescript
// TODO: Replace all instances of:
window.parent.postMessage(message, "*");

// With:
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_HOST_ORIGIN || window.location.origin;
window.parent.postMessage(message, ALLOWED_ORIGIN);
```

#### 10.1.5 Dependencies (Must Add)

```bash
# Install jose for JWT validation against WSO2
npm install jose

# Add to package.json
"dependencies": {
  "jose": "^5.2.0"  // For JWT/JWKS validation
}
```

#### 10.1.6 Build & Packaging (Must Implement)

- [ ] **`dpac-embed.min.js`** - Bundled embed script for easy integration
  - Self-contained JavaScript file
  - Creates all iframes automatically
  - Handles all postMessage communication
  - Minified and versioned

#### 10.1.7 Configuration (Must Implement)

- [ ] **CORS headers** in `next.config.js` (see Section 8.4)
- [ ] **Environment variables** documentation
- [ ] **Origin allowlist** configuration

---

### 10.2 🌐 PORTAL DEVELOPERS (Host Application)

> **Owner**: Teams integrating D.PaC widget into their applications
> **Examples**: Angular apps, React apps, Vue apps, vanilla HTML

These are the features that **portal developers** must implement in their host applications to integrate the widget.

#### 10.2.1 Authentication Handoff (Must Implement)

> **✅ Good News**: No new JWT minting required! Reuse the existing WSO2 token from the portal.

| Task | Priority | Description |
|------|----------|-------------|
| JWT Retrieval | **HIGH** | Get existing DPaC JWT from localStorage/AuthService |
| Session Creation | **HIGH** | Call `/dpac/session` with existing JWT before opening widget |
| Token Refresh | **MEDIUM** | Handle token expiry (redirect to login or refresh) |

**JWT Retrieval (Already Available):**

The JWT is already present in the DLWEB application after user login:
```typescript
// The JWT is typically stored in:
const jwt = localStorage.getItem('access_token');
// OR from your AuthService:
const jwt = this.authService.getAccessToken();
```

**No JWT Minting Required:**

The existing token already contains the required claims:
  ```json
// LDAP User (already in localStorage)
  {
  "sub": "stefano.solli@cultura.gov.it",
  "iss": "https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery",
  "email": "stefano.solli@cultura.gov.it",
  "roles": "everyone",
  "exp": 1761653468
}

// SPID User (already in localStorage)
{
  "sub": "SPID-002TINIT-LVLDAA85T50G702B",
  "iss": "https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery",
  "fiscalNumber": "TINIT-LVLDAA85T50G702B",
  "exp": 1762535261
  }
  ```

**Session Creation Flow (Angular/DLWEB):**
```typescript
// In your Angular service (DLWEB)
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class DpacWidgetService {
  
  constructor(private http: HttpClient) {}

  async initDpacWidget(): Promise<boolean> {
    // 1. Get the EXISTING JWT (already present from WSO2 login)
    const jwt = localStorage.getItem('access_token');
    
    if (!jwt) {
      console.error('User not logged in');
      return false;
    }
    
    // 2. Create widget session (validates JWT, sets cookie)
    try {
      const response = await this.http.post<{success: boolean}>(
        '/dpac/session',
        { jwt, ttl: 300 },
        { withCredentials: true }
      ).toPromise();
      
      if (!response?.success) {
        console.error('Widget session creation failed');
        return false;
  }
  
      // 3. Now safe to show widget
      this.showWidgetIframe();
      return true;
      
    } catch (error) {
      console.error('Widget initialization error:', error);
      return false;
    }
  }
  
  private showWidgetIframe(): void {
    const modal = document.getElementById('dpac-modal');
    if (modal) modal.style.display = 'block';
  }
}
```

#### 10.2.2 Widget Integration (Must Implement)

| Task | Priority | Description |
|------|----------|-------------|
| Embed iframes | **HIGH** | Add widget iframes to page |
| Message handling | **HIGH** | Listen for postMessage events |
| Overlay controls | **HIGH** | Backdrop, emergency close, ESC key |
| Visibility toggle | **HIGH** | Show/hide iframes based on state |

**Required HTML Structure:**
```html
<!-- Launcher (always visible) -->
<iframe id="dpac-launcher" src="/dpac/launcher" 
  style="position:fixed;bottom:20px;right:20px;width:60px;height:60px;z-index:2147483000;border:none;">
</iframe>

<!-- Chat Modal (hidden by default) -->
<iframe id="dpac-modal" src="/dpac/modal" 
  style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483001;display:none;border:none;">
</iframe>

<!-- Source Picker (hidden by default) -->
<iframe id="dpac-source-picker" src="/dpac/source-picker" 
  style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483002;display:none;border:none;">
</iframe>

<!-- File Select (hidden by default) -->
<iframe id="dpac-file-select" src="/dpac/file-select" 
  style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;z-index:2147483003;display:none;border:none;">
</iframe>

<!-- Backdrop -->
<div id="dpac-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2147482999;display:none;"></div>

<!-- Emergency Close Button -->
<button id="dpac-emergency-close" style="position:fixed;top:10px;right:10px;width:36px;height:36px;z-index:2147483999;display:none;">✕</button>
```

**Required JavaScript Event Handlers:**
```javascript
// Portal developers must implement:
window.addEventListener('message', (event) => {
  // 1. Validate origin
  if (event.origin !== WIDGET_ORIGIN) return;
  
  const { type, payload } = event.data;
  if (!type?.startsWith('dpac.widget.')) return;
  
  // 2. Handle each event type
  switch (type) {
    case 'dpac.widget.loaded':
      // Mark iframe as loaded, clear timeout
      break;
    case 'dpac.widget.open':
      // Show modal, backdrop, emergency close
      break;
    case 'dpac.widget.close':
      // Hide all modals
      break;
    case 'dpac.widget.openSourcePicker':
      // Show source picker iframe
      break;
    case 'dpac.widget.openFileSelect':
      // Show file select, forward message to iframe
      break;
    case 'dpac.widget.filesSelected':
      // Forward to chat modal
      break;
    // ... handle all events from Section 7
  }
});
```

#### 10.2.3 Error Handling (Must Implement)

| Task | Priority | Description |
|------|----------|-------------|
| Load timeout | **HIGH** | Show error if iframe doesn't load in 10s |
| Auth failures | **HIGH** | Handle session creation failures |
| User feedback | **MEDIUM** | Toast/modal for errors |

**Load Timeout Implementation:**
```javascript
function startLoadTimeout(iframeName) {
  return setTimeout(() => {
    if (!iframeLoaded[iframeName]) {
      showError('Widget failed to load. Please try again.');
      closeAllModals();
    }
  }, 10000); // 10 seconds
}
```

**Auth Failure Handling:**
```javascript
async function handleAuthFailure(error) {
  // Option 1: Show toast message
  showToast('Session expired. Please refresh the page.');
  
  // Option 2: Redirect to login
  window.location.href = '/login?redirect=' + encodeURIComponent(window.location.href);
  
  // Option 3: Refresh token and retry
  await refreshToken();
  await initDpacWidget();
}
```

#### 10.2.4 Framework-Specific Implementation

See full examples in:
- **Angular**: Section 4.2 (DpacWidgetService + DpacWidgetComponent)
- **React**: Section 4.3 (DpacWidget functional component)
- **Vanilla JS**: Section 4.4 (Full implementation)

#### 10.2.5 Styling & Customization (Optional)

| Task | Priority | Description |
|------|----------|-------------|
| Position adjustment | **LOW** | Change widget position if conflicts |
| Z-index adjustment | **LOW** | Adjust if conflicts with existing UI |
| Backdrop styling | **LOW** | Customize backdrop appearance |

---

### 10.3 ⚙️ OPERATIONS TEAM

> **Owner**: DevOps / Infrastructure Team

| Task | Priority | Description |
|------|----------|-------------|
| Nginx configuration | **HIGH** | Reverse proxy setup (Section 5.2) |
| PM2 setup | **HIGH** | Process management |
| SSL certificates | **HIGH** | HTTPS required for SameSite=None cookies |
| Azure NSG | **MEDIUM** | Open required ports |
| Monitoring | **MEDIUM** | Health checks, alerts |

---

### 10.4 📋 IMPLEMENTATION CHECKLIST

#### Widget Team Checklist
- [x] Implement `POST /dpac/session` endpoint ✅
- [x] Implement `GET /chat/stream` SSE endpoint ✅
- [x] Implement `GET /api/chat/poll` polling endpoint ✅
- [x] Implement `GET /api/health` endpoint ✅
- [x] WSO2 JWT validation with JWKS ✅
- [x] Session cookie creation (HttpOnly, Secure) ✅
- [x] LDAP/SPID user type detection ✅
- [ ] Add SSE consumer to ChatCard component
- [ ] Create login modal fallback
- [ ] Emit `dpac.widget.ready` event
- [ ] Emit `dpac.widget.error` event
- [ ] Emit `dpac.auth` event
- [ ] Fix postMessage security (replace `"*"`)
- [ ] Add CORS headers in next.config.js
- [ ] Build `dpac-embed.min.js` bundle
- [x] Document environment variables ✅

#### Portal Developer Checklist
- [ ] ~~Implement JWT minting for widget~~ **Not needed** - reuse existing WSO2 JWT
- [ ] Retrieve existing JWT from `localStorage.getItem('access_token')`
- [ ] Call `/dpac/session` with existing JWT before opening widget
- [ ] Add widget iframes to page HTML
- [ ] Implement postMessage event listener
- [ ] Handle `dpac.widget.loaded` event
- [ ] Handle `dpac.widget.open` / `close` events
- [ ] Handle `dpac.widget.openSourcePicker` event
- [ ] Handle `dpac.widget.closeSourcePicker` event
- [ ] Handle `dpac.widget.openFileSelect` event
- [ ] Handle `dpac.widget.closeFileSelect` event
- [ ] Handle `dpac.widget.filesSelected` event (forward to chat)
- [ ] Implement 10-second load timeout
- [ ] Add backdrop with click-to-close
- [ ] Add emergency close button
- [ ] Add ESC key handler
- [ ] Handle auth failures gracefully
- [ ] Test cross-origin cookie behavior

#### Operations Checklist
- [ ] Configure Nginx reverse proxy
- [ ] Setup PM2 process manager
- [ ] Install SSL certificates
- [ ] Open Azure NSG ports (3000, 9000, 8002)
- [ ] Configure health check monitoring
- [ ] Setup log aggregation

---

### 10.5 🚀 FUTURE ENHANCEMENTS (Nice to Have)

| Feature | Owner | Priority |
|---------|-------|----------|
| Widget resizing for mobile | Widget Team | LOW |
| Auto-retry on stream disconnect | Widget Team | LOW |
| Offline mode with queued messages | Widget Team | LOW |
| Multi-language support | Widget Team | LOW |
| Analytics/telemetry | Widget Team | LOW |
| A/B testing capability | Widget Team | LOW |
| Custom theming API | Widget Team | LOW |
| Keyboard navigation | Widget Team | LOW |

---

## Appendix A: File Structure

```
dpac-widget-main/
├── docs/
│   ├── api-docs.json
│   ├── AUTHENTICATION_SECURITY.md  # ✅ JWT/WSO2 auth documentation
│   └── DXC - Manuale Tecnico Operativo_v1.0.pdf
├── public/
│   └── dpac-embed/
│       ├── dpac-embed.min.js      # Placeholder (to be built)
│       └── images/
│           ├── dpac-logo.svg
│           ├── launcher.svg
│           └── srclogo.svg
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   ├── poll/
│   │   │   │   │   └── route.ts    # ✅ GET /api/chat/poll (Celery polling)
│   │   │   │   └── route.ts        # POST /api/chat
│   │   │   ├── health/
│   │   │   │   └── route.ts        # ✅ GET /api/health
│   │   │   └── minio/
│   │   │       ├── files/
│   │   │       │   └── route.ts    # GET /api/minio/files
│   │   │       ├── folders/
│   │   │       │   └── route.ts    # GET /api/minio/folders
│   │   │       └── test/
│   │   │           └── route.ts    # GET /api/minio/test
│   │   ├── chat/
│   │   │   └── stream/
│   │   │       └── route.ts        # ✅ GET /chat/stream (SSE)
│   │   ├── dpac/
│   │   │   ├── ChatCard.tsx        # Main chat component
│   │   │   ├── FileSelectCard.tsx  # File selection component
│   │   │   ├── SourceCard.tsx      # Source picker component
│   │   │   ├── file-select/
│   │   │   │   └── page.tsx        # /dpac/file-select
│   │   │   ├── host-test/
│   │   │   │   └── page.tsx        # /dpac/host-test (demo)
│   │   │   ├── launcher/
│   │   │   │   └── page.tsx        # /dpac/launcher
│   │   │   ├── modal/
│   │   │   │   └── page.tsx        # /dpac/modal
│   │   │   ├── session/
│   │   │   │   └── route.ts        # ✅ POST /dpac/session (JWT auth)
│   │   │   ├── source-picker/
│   │   │   │   └── page.tsx        # /dpac/source-picker
│   │   │   └── page.tsx            # /dpac (redirect)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── dpac-auth.ts            # ✅ JWT validation & session management
│       └── supabase.ts
├── .env.local                      # Environment variables (gitignored)
├── next.config.js
├── package.json
├── README.md
├── IMPLEMENTATION_GUIDE.md         # This file
└── tsconfig.json
```

---

## Appendix B: Quick Reference

### URLs

| Environment | Host App | Widget Base |
|-------------|----------|-------------|
| Local | `http://localhost:4200` | `http://localhost:3000` |
| Staging | `https://staging.example.com` | `https://staging.example.com/dpac` |
| Production | `https://prod.example.com` | `https://prod.example.com/dpac` |

### Ports

| Service | Port | Protocol |
|---------|------|----------|
| Widget (Next.js) | 3000 | HTTP |
| Host App (Angular) | 4200 | HTTP |
| Nginx | 80/443 | HTTP/HTTPS |
| MinIO | 9000 | HTTP |
| Backend Inference | 8002 | HTTP |

### Key Contacts

| Role | Name | Responsibilities |
|------|------|------------------|
| Backend/AI | Zakaria | API implementation, coordination |
| PM | Guglielmo | Requirements, FE liaison |
| Full-stack | Hamid | Widget implementation, overlay |

---

*Last updated: December 3, 2025*

