# D.PaC Widget

> **D**igital **Pa**tform for **C**ultural Heritage - Embeddable Chat Widget

A Next.js-based chat widget that integrates with the DPaC Portal (DLWEB) for document-based Q&A using vector inference.

---

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [Running Standalone](#-running-standalone)
3. [Integration with Existing Frontend](#-integration-with-existing-frontend)
4. [API Reference](#-api-reference)
5. [Environment Configuration](#-environment-configuration)
6. [Deployment](#-deployment)
7. [Troubleshooting](#-troubleshooting)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to MinIO storage
- Access to Vector Inference backend

### Installation

```bash
# Clone the repository
git clone https://github.dxc.com/hfnighar/dpac-widget.git
cd dpac-widget

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
npm run dev
```

### Test Page

Open **http://localhost:3000/dpac/host-test** to see the complete widget integration demo.

---

## 🖥️ Running Standalone

### Development Mode

```bash
npm run dev
```

The widget will be available at:
- **Launcher**: http://localhost:3000/dpac/launcher
- **Chat Modal**: http://localhost:3000/dpac/modal
- **Source Picker**: http://localhost:3000/dpac/source-picker
- **File Select**: http://localhost:3000/dpac/file-select
- **Test Page**: http://localhost:3000/dpac/host-test

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Build and start
npm run build
pm2 start npm --name "dpac-widget" -- start

# View logs
pm2 logs dpac-widget

# Monitor
pm2 monit

# Save configuration
pm2 save
pm2 startup
```

---

## 🔌 Integration with Existing Frontend

### Option 1: HTML/Vanilla JavaScript

Add these iframes to your HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Your Application</title>
  <style>
    /* Widget iframe styles */
    .dpac-iframe {
      position: fixed;
      border: none;
      z-index: 2147483000;
    }
    
    /* Backdrop for modal */
    #dpac-backdrop {
      position: fixed;
      inset: 0;
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
      font-size: 20px;
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
    class="dpac-iframe"
    style="bottom:20px;right:20px;width:60px;height:60px;background:transparent;">
  </iframe>

  <!-- Chat Modal (hidden by default) -->
  <iframe 
    id="dpac-modal" 
    src="/dpac/modal"
    class="dpac-iframe"
    style="bottom:20px;right:20px;width:294px;height:418px;display:none;">
  </iframe>

  <!-- Source Picker (hidden by default) -->
  <iframe 
    id="dpac-source-picker" 
    src="/dpac/source-picker"
    class="dpac-iframe"
    style="bottom:20px;right:20px;width:294px;height:418px;display:none;">
  </iframe>

  <!-- File Select (hidden by default) -->
  <iframe 
    id="dpac-file-select" 
    src="/dpac/file-select"
    class="dpac-iframe"
    style="bottom:20px;right:20px;width:294px;height:418px;display:none;">
  </iframe>

  <!-- Backdrop -->
  <div id="dpac-backdrop"></div>
  
  <!-- Emergency Close Button -->
  <button id="dpac-emergency-close">✕</button>

  <script>
    // Widget state
    const state = { view: 'closed' };
    
    // DOM elements
    const elements = {
      launcher: document.getElementById('dpac-launcher'),
      modal: document.getElementById('dpac-modal'),
      sourcePicker: document.getElementById('dpac-source-picker'),
      fileSelect: document.getElementById('dpac-file-select'),
      backdrop: document.getElementById('dpac-backdrop'),
      emergencyClose: document.getElementById('dpac-emergency-close'),
    };

    // Close all modals
    function closeAll() {
      elements.modal.style.display = 'none';
      elements.sourcePicker.style.display = 'none';
      elements.fileSelect.style.display = 'none';
      elements.backdrop.style.display = 'none';
      elements.emergencyClose.style.display = 'none';
      state.view = 'closed';
    }

    // Message handler
    window.addEventListener('message', (event) => {
      const { type, payload } = event.data || {};
      if (!type?.startsWith('dpac.widget.')) return;

      console.log('[DPaC]', type, payload);

      switch (type) {
        case 'dpac.widget.open':
          elements.modal.style.display = 'block';
          elements.backdrop.style.display = 'block';
          elements.emergencyClose.style.display = 'flex';
          state.view = 'chat';
          break;

        case 'dpac.widget.close':
          closeAll();
          break;

        case 'dpac.widget.openSourcePicker':
          elements.sourcePicker.style.display = 'block';
          state.view = 'source-picker';
          break;

        case 'dpac.widget.closeSourcePicker':
          elements.sourcePicker.style.display = 'none';
          state.view = 'chat';
          break;

        case 'dpac.widget.openFileSelect':
          elements.fileSelect.style.display = 'block';
          elements.fileSelect.contentWindow?.postMessage(event.data, '*');
          state.view = 'file-select';
          break;

        case 'dpac.widget.closeFileSelect':
          elements.fileSelect.style.display = 'none';
          state.view = 'source-picker';
          break;

        case 'dpac.widget.filesSelected':
          elements.modal.contentWindow?.postMessage(event.data, '*');
          break;
      }
    });

    // Keyboard handler (ESC to close)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.view !== 'closed') {
        closeAll();
      }
    });

    // Click handlers
    elements.backdrop.addEventListener('click', closeAll);
    elements.emergencyClose.addEventListener('click', closeAll);

    console.log('[DPaC] Widget host initialized');
  </script>
</body>
</html>
```

### Option 2: Angular (DLWEB) Integration

#### 1. Create the Widget Service

```typescript
// src/app/services/dpac-widget.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

type WidgetState = 'closed' | 'chat' | 'source-picker' | 'file-select';

@Injectable({ providedIn: 'root' })
export class DpacWidgetService {
  private state$ = new BehaviorSubject<WidgetState>('closed');
  public widgetState = this.state$.asObservable();

  constructor(private http: HttpClient) {
    this.initMessageListener();
    this.initKeyboardListener();
  }

  /**
   * Initialize the widget session using the existing DPaC Portal JWT.
   * Call this before opening the widget.
   */
  async initSession(): Promise<boolean> {
    // Get existing JWT from localStorage (already set by WSO2 login)
    const jwt = localStorage.getItem('access_token');
    
    if (!jwt) {
      console.error('[DPaC Widget] No JWT found - user must be logged in');
      return false;
    }

    try {
      const response = await this.http.post<{ success: boolean }>(
        '/dpac/session',
        { jwt, ttl: 300 },
        { withCredentials: true }
      ).toPromise();

      return response?.success || false;
    } catch (error) {
      console.error('[DPaC Widget] Session creation failed:', error);
      return false;
    }
  }

  private initMessageListener(): void {
    window.addEventListener('message', (event) => {
      const { type, payload } = event.data || {};
      if (!type?.startsWith('dpac.widget.')) return;

      switch (type) {
        case 'dpac.widget.open':
          this.state$.next('chat');
          break;
        case 'dpac.widget.close':
          this.state$.next('closed');
          break;
        case 'dpac.widget.openSourcePicker':
          this.state$.next('source-picker');
          break;
        case 'dpac.widget.closeSourcePicker':
          this.state$.next('chat');
          break;
        case 'dpac.widget.openFileSelect':
          this.state$.next('file-select');
          this.forwardToIframe('dpac-file-select', event.data);
          break;
        case 'dpac.widget.closeFileSelect':
          this.state$.next('source-picker');
          break;
        case 'dpac.widget.filesSelected':
          this.forwardToIframe('dpac-modal', event.data);
          break;
      }
    });
  }

  private initKeyboardListener(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state$.value !== 'closed') {
        this.close();
      }
    });
  }

  private forwardToIframe(id: string, message: any): void {
    const iframe = document.getElementById(id) as HTMLIFrameElement;
    iframe?.contentWindow?.postMessage(message, '*');
  }

  async open(): Promise<void> {
    const sessionOk = await this.initSession();
    if (sessionOk) {
      this.state$.next('chat');
    } else {
      alert('Sessione scaduta. Effettuare nuovamente il login.');
    }
  }

  close(): void {
    this.state$.next('closed');
  }
}
```

#### 2. Create the Widget Component

```typescript
// src/app/components/dpac-widget/dpac-widget.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { DpacWidgetService } from '../../services/dpac-widget.service';

@Component({
  selector: 'app-dpac-widget',
  template: `
    <!-- Launcher -->
    <iframe id="dpac-launcher" [src]="launcherUrl"
      style="position:fixed;bottom:20px;right:20px;width:60px;height:60px;border:none;z-index:2147483000;background:transparent;">
    </iframe>

    <!-- Chat Modal -->
    <iframe id="dpac-modal" [src]="modalUrl"
      [style.display]="state !== 'closed' ? 'block' : 'none'"
      style="position:fixed;bottom:20px;right:20px;width:294px;height:418px;border:none;z-index:2147483001;">
    </iframe>

    <!-- Source Picker -->
    <iframe id="dpac-source-picker" [src]="sourcePickerUrl"
      [style.display]="state === 'source-picker' || state === 'file-select' ? 'block' : 'none'"
      style="position:fixed;bottom:20px;right:322px;width:294px;height:418px;border:none;z-index:2147483002;">
    </iframe>

    <!-- File Select -->
    <iframe id="dpac-file-select" [src]="fileSelectUrl"
      [style.display]="state === 'file-select' ? 'block' : 'none'"
      style="position:fixed;bottom:20px;right:624px;width:294px;height:418px;border:none;z-index:2147483003;">
    </iframe>

    <!-- Backdrop -->
    <div *ngIf="state !== 'closed'"
      (click)="close()"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(2px);z-index:2147482999;">
    </div>

    <!-- Emergency Close -->
    <button *ngIf="state !== 'closed'"
      (click)="close()"
      style="position:fixed;top:10px;right:10px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.7);color:white;border:2px solid rgba(255,255,255,0.3);cursor:pointer;z-index:2147483999;display:flex;align-items:center;justify-content:center;font-size:20px;">
      ✕
    </button>
  `
})
export class DpacWidgetComponent implements OnInit, OnDestroy {
  launcherUrl: SafeResourceUrl;
  modalUrl: SafeResourceUrl;
  sourcePickerUrl: SafeResourceUrl;
  fileSelectUrl: SafeResourceUrl;
  state: string = 'closed';
  
  private subscription?: Subscription;

  constructor(
    private sanitizer: DomSanitizer,
    private widgetService: DpacWidgetService
  ) {
    const baseUrl = ''; // Same-origin, or use full URL if different domain
    this.launcherUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/launcher`);
    this.modalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/modal`);
    this.sourcePickerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/source-picker`);
    this.fileSelectUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${baseUrl}/dpac/file-select`);
  }

  ngOnInit(): void {
    this.subscription = this.widgetService.widgetState.subscribe(state => {
      this.state = state;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  close(): void {
    this.widgetService.close();
  }
}
```

#### 3. Add to Your App Module

```typescript
// src/app/app.module.ts
import { DpacWidgetComponent } from './components/dpac-widget/dpac-widget.component';

@NgModule({
  declarations: [
    // ...
    DpacWidgetComponent
  ],
  // ...
})
export class AppModule { }
```

#### 4. Use in Your Template

```html
<!-- app.component.html -->
<router-outlet></router-outlet>

<!-- Add the widget -->
<app-dpac-widget></app-dpac-widget>
```

### Option 3: React Integration

```tsx
// components/DpacWidget.tsx
import React, { useEffect, useState, useCallback } from 'react';

type WidgetState = 'closed' | 'chat' | 'source-picker' | 'file-select';

export const DpacWidget: React.FC = () => {
  const [state, setState] = useState<WidgetState>('closed');

  // Initialize session before opening
  const initSession = async (): Promise<boolean> => {
    const jwt = localStorage.getItem('access_token');
    if (!jwt) return false;

    try {
      const response = await fetch('/dpac/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jwt, ttl: 300 })
      });
      const data = await response.json();
      return data.success;
    } catch {
      return false;
    }
  };

  const closeAll = useCallback(() => setState('closed'), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};
      if (!type?.startsWith('dpac.widget.')) return;

      switch (type) {
        case 'dpac.widget.open':
          initSession().then(ok => ok && setState('chat'));
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
          document.getElementById('dpac-file-select')
            ?.contentWindow?.postMessage(event.data, '*');
          break;
        case 'dpac.widget.closeFileSelect':
          setState('source-picker');
          break;
        case 'dpac.widget.filesSelected':
          document.getElementById('dpac-modal')
            ?.contentWindow?.postMessage(event.data, '*');
          break;
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [closeAll]);

  const isOpen = state !== 'closed';

  return (
    <>
      <iframe id="dpac-launcher" src="/dpac/launcher" title="DPaC Launcher"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 60, height: 60, border: 'none', zIndex: 2147483000, background: 'transparent' }} />
      
      <iframe id="dpac-modal" src="/dpac/modal" title="DPaC Chat"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483001, display: isOpen ? 'block' : 'none' }} />
      
      <iframe id="dpac-source-picker" src="/dpac/source-picker" title="DPaC Sources"
        style={{ position: 'fixed', bottom: 20, right: 322, width: 294, height: 418, border: 'none', zIndex: 2147483002, display: state === 'source-picker' || state === 'file-select' ? 'block' : 'none' }} />
      
      <iframe id="dpac-file-select" src="/dpac/file-select" title="DPaC Files"
        style={{ position: 'fixed', bottom: 20, right: 624, width: 294, height: 418, border: 'none', zIndex: 2147483003, display: state === 'file-select' ? 'block' : 'none' }} />
      
      {isOpen && (
        <>
          <div onClick={closeAll}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', zIndex: 2147482999 }} />
          <button onClick={closeAll}
            style={{ position: 'fixed', top: 10, right: 10, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: 'white', border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', zIndex: 2147483999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            ✕
          </button>
        </>
      )}
    </>
  );
};
```

---

## 📚 API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dpac/session` | POST | Create authenticated session from DPaC JWT |
| `/api/chat` | POST | Send chat message (non-streaming) |
| `/chat/stream` | GET | SSE streaming chat responses |
| `/api/minio/folders` | GET | List MinIO folders |
| `/api/minio/files` | GET | List files in folder |
| `/api/health` | GET | Health check |

### POST /dpac/session

Create an authenticated session using the existing DPaC Portal JWT.

**Request:**
```bash
curl -X POST /dpac/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"ttl": 300}'
```

**Response:**
```json
{
  "success": true,
  "session_id": "dpac_abc123",
  "expires_at": "2025-11-28T11:00:00Z",
  "user_id": "stefano.solli@cultura.gov.it",
  "auth_type": "LDAP"
}
```

### GET /chat/stream

SSE streaming endpoint for real-time chat responses.

**Request:**
```
GET /chat/stream?question=Come%20funziona&files=["doc.pdf"]&language=it
```

**Response (SSE):**
```
data: {"token": "Il "}
data: {"token": "processo "}
data: {"token": "funziona..."}
data: {"done": true, "metadata": {"sources": ["doc.pdf"]}}
```

---

## ⚙️ Environment Configuration

Create a `.env.local` file in the project root:

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
# Backend API (Vector Inference - Async)
# ============================================
BACKEND_API_URL=http://72.146.12.109:8002

# ============================================
# Supabase Configuration (for async response retrieval)
# ============================================
# The vector inference API returns task IDs. 
# Responses are stored in Supabase via webhook.
NEXT_PUBLIC_SUPABASE_URL=http://72.146.12.109:8100
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Webhook URL (for reference)
# WEBHOOK_URL=http://172.190.175.21:3001/api/webhook-pg

# ============================================
# WSO2 Identity Provider (for JWT validation)
# ============================================
# Production:
WSO2_ISSUER_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery
WSO2_JWKS_URI=https://identity.cloud.sbn.it/t/ispc.it/oauth2/jwks
# Staging (uncomment for testing):
# WSO2_ISSUER_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/oidcdiscovery
# WSO2_JWKS_URI=https://identity-collaudo.cloud.sbn.it/t/coll.ispc.it/oauth2/jwks

# ============================================
# Session
# ============================================
SESSION_TTL=300

# ============================================
# CORS
# ============================================
ALLOWED_ORIGINS=https://your-domain.com

# ============================================
# Environment
# ============================================
NODE_ENV=production
```

---

## 🚀 Deployment

### Option 1: Same Server (Nginx Reverse Proxy)

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;

    # Host application (Angular/React)
    location / {
        proxy_pass http://localhost:4200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # Widget routes
    location /dpac/ {
        proxy_pass http://localhost:3000/dpac/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_cookie_path / /;
    }

    # Widget API
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_read_timeout 60s;
    }

    # SSE streaming
    location /chat/stream {
        proxy_pass http://localhost:3000/chat/stream;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        add_header X-Accel-Buffering "no";
    }
}
```

### Option 2: Azure App Service

```bash
# Create App Service
az webapp create --resource-group dpac-rg --plan dpac-plan --name dpac-widget --runtime "NODE:18-lts"

# Configure environment
az webapp config appsettings set --resource-group dpac-rg --name dpac-widget --settings \
  MINIO_ENDPOINT="72.146.30.121" \
  MINIO_PORT="9000" \
  WSO2_ISSUER_URI="https://identity.cloud.sbn.it/t/ispc.it/oauth2/oidcdiscovery"

# Deploy
az webapp deployment source config-local-git --name dpac-widget --resource-group dpac-rg
git push azure main
```

---

## 🔧 Troubleshooting

### Widget not loading

```bash
# Check if widget is running
curl http://localhost:3000/dpac/launcher

# Check PM2 status
pm2 status dpac-widget

# View logs
pm2 logs dpac-widget --lines 50
```

### 401 Unauthorized

1. Check if JWT is expired:
```javascript
const jwt = localStorage.getItem('access_token');
const payload = JSON.parse(atob(jwt.split('.')[1]));
console.log('Expires:', new Date(payload.exp * 1000));
```

2. Check if WSO2 issuer matches:
```javascript
console.log('Issuer:', payload.iss);
// Should match WSO2_ISSUER_URI in .env.local
```

### SSE not streaming

Check Nginx configuration:
```nginx
location /chat/stream {
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering "no";
}
```

### CORS errors

Ensure `ALLOWED_ORIGINS` in `.env.local` includes your host application domain.

---

## 📖 Further Documentation

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for:
- Detailed architecture documentation
- DPaC platform integration details
- Security considerations
- Widget event reference
- Development responsibilities

---

## 👥 Team

| Name | Role |
|------|------|
| Zakaria | Backend/AI |
| Hamid | Full-stack |
| Guglielmo | PM (Italy Analytics) |

---

*Last updated: November 28, 2025*
