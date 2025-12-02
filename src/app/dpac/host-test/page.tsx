"use client";

export default function HostTestPage() {
  const script = `
    (function(){
      // ===== CONSTANTS =====
      const GAP = 8;
      const CARD_W = 294, CARD_H = 418;
      const MARGIN = 20;
      const DEBUG = true;

      // ===== SECURITY: Get allowed origin =====
      const ALLOWED_ORIGIN = window.location.origin;

      // ===== DOM REFERENCES =====
      const launcher = document.getElementById('dpac-launcher');
      const chat = document.getElementById('dpac-modal');
      const picker = document.getElementById('dpac-source-picker');

      // ===== IFRAME LIFECYCLE STATE =====
      const iframeState = {
        launcher: false,
        modal: false,
        sourcePicker: false
      };

      // ===== LOAD TIMEOUT TRACKING =====
      const loadTimeouts = {
        modal: null,
        sourcePicker: null
      };

      // ===== UTILITY FUNCTIONS =====
      function log(...args) {
        if (DEBUG) console.log('[DPaC Widget Host]', ...args);
      }

      function logError(...args) {
        console.error('[DPaC Widget Host ERROR]', ...args);
      }

      function show(el) { 
        if(el) {
          el.style.display = 'block';
          log('Showing element:', el.id);
        }
      }

      function hide(el) { 
        if(el) {
          el.style.display = 'none';
          log('Hiding element:', el.id);
        }
      }

      function isAnyModalOpen() {
        return (chat && chat.style.display === 'block') ||
               (picker && picker.style.display === 'block');
      }

      function closeAll() {
        hide(chat);
        hide(picker);
        hideBackdrop();
        updateEmergencyClose();
        log('All modals closed');
      }

      // ===== BACKDROP & EMERGENCY CLOSE FUNCTIONS =====
      function showBackdrop() {
        const backdrop = document.getElementById('dpac-backdrop');
        if (backdrop) {
          backdrop.style.display = 'block';
          log('Backdrop shown');
        }
      }

      function hideBackdrop() {
        const backdrop = document.getElementById('dpac-backdrop');
        if (backdrop) {
          backdrop.style.display = 'none';
          log('Backdrop hidden');
        }
      }

      function updateEmergencyClose() {
        const btn = document.getElementById('dpac-emergency-close');
        if (btn) {
          btn.style.display = isAnyModalOpen() ? 'flex' : 'none';
        }
      }

      // ===== LOAD TIMEOUT HANDLER =====
      function startLoadTimeout(iframeName, iframeEl) {
        if (loadTimeouts[iframeName]) {
          clearTimeout(loadTimeouts[iframeName]);
        }

        loadTimeouts[iframeName] = setTimeout(() => {
          if (!iframeState[iframeName]) {
            logError(iframeName + ' failed to load within 10 seconds');
            
            const errorOverlay = document.createElement('div');
            errorOverlay.style.cssText = \`
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: white;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 20px;
              text-align: center;
              z-index: 999999;
            \`;
            errorOverlay.innerHTML = \`
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom: 16px;">
                <circle cx="12" cy="12" r="10" stroke="#EF4444" stroke-width="2"/>
                <path d="M12 8v4M12 16h.01" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3 style="margin: 0 0 8px 0; color: #111; font-size: 16px;">Widget non disponibile</h3>
              <p style="margin: 0 0 16px 0; color: #666; font-size: 13px;">Il widget non risponde. Verifica la connessione.</p>
              <button id="error-close-btn" style="
                padding: 8px 16px;
                background: #334C66;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">Chiudi</button>
            \`;
            
            if (iframeEl && iframeEl.parentElement) {
              iframeEl.parentElement.style.position = 'relative';
              iframeEl.parentElement.appendChild(errorOverlay);
              
              const closeBtn = errorOverlay.querySelector('#error-close-btn');
              if (closeBtn) {
                closeBtn.addEventListener('click', closeAll);
              }
            }
          }
        }, 10000);
      }

      // ===== POSITIONING FUNCTIONS =====
      function placeOne() { 
        if(!chat) return; 
        chat.style.right = MARGIN+'px'; 
        chat.style.bottom = MARGIN+'px'; 
      }

      function placeTwo() { 
        if(!chat||!picker) return; 
        picker.style.right = MARGIN+'px'; 
        picker.style.bottom = MARGIN+'px'; 
        chat.style.right = (MARGIN + CARD_W + GAP)+'px'; 
        chat.style.bottom = MARGIN+'px'; 
      }

      function enoughWidth(n) {
        try { 
          const vw = window.innerWidth || document.documentElement.clientWidth || 0; 
          const needed = MARGIN + n*CARD_W + (n-1)*GAP + MARGIN; 
          return vw >= needed; 
        } catch { 
          return false; 
        }
      }

      // ===== MESSAGE VALIDATION =====
      function isValidMessage(data) {
        return data && 
               typeof data === 'object' && 
               typeof data.type === 'string' &&
               data.type.startsWith('dpac.widget.');
      }

      // ===== IFRAME COMMUNICATION =====
      function sendToIframe(iframeEl, iframeName, message) {
        if (!iframeEl || !iframeEl.contentWindow) {
          logError('Cannot send message - iframe not found:', iframeName);
          return false;
        }

        try {
          iframeEl.contentWindow.postMessage(message, ALLOWED_ORIGIN);
          log('Message sent to', iframeName, ':', message);
          return true;
        } catch (e) {
          logError('Failed to send message to', iframeName, ':', e);
          return false;
        }
      }

      // ===== MESSAGE HANDLER =====
      window.addEventListener('message', function(ev) {
        try {
          // ===== SECURITY: Validate origin =====
          if (ev.origin !== ALLOWED_ORIGIN) {
            logError('Message from untrusted origin rejected:', ev.origin);
            return;
          }

          // ===== Validate message structure =====
          if (!isValidMessage(ev.data)) {
            return;
          }

          const msgType = ev.data.type;
          const payload = ev.data.payload;

          log('Received message:', msgType, payload);

          // ===== LIFECYCLE MESSAGES =====
          if (msgType === 'dpac.widget.loaded') {
            const source = payload?.source;
            if (source && iframeState.hasOwnProperty(source)) {
              iframeState[source] = true;
              log('Iframe loaded:', source);
              
              if (loadTimeouts[source]) {
                clearTimeout(loadTimeouts[source]);
                loadTimeouts[source] = null;
              }
            }
            return;
          }

          // ===== WIDGET CONTROL MESSAGES =====
          if (msgType === 'dpac.widget.open') { 
            if (chat && chat.style.display === 'block') { 
              closeAll();
            } else { 
              show(chat); 
              placeOne();
              showBackdrop();
              updateEmergencyClose();
              startLoadTimeout('modal', chat);
            } 
          }

          if (msgType === 'dpac.widget.close') { 
            closeAll();
          }

          if (msgType === 'dpac.widget.openSourcePicker') { 
            if(!chat) return; 
            show(picker); 
            if(enoughWidth(2)) {
              placeTwo(); 
            } else { 
              picker.style.right = MARGIN+'px'; 
              picker.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
              placeOne(); 
            }
            updateEmergencyClose();
            startLoadTimeout('sourcePicker', picker);
          }

          if (msgType === 'dpac.widget.closeSourcePicker') { 
            hide(picker); 
            placeOne();
            updateEmergencyClose();
          }

          if (msgType === 'dpac.widget.projectSelected') {
            log('Project selected:', payload?.project);
            // Forward to chat modal
            if (chat && chat.contentWindow) {
              sendToIframe(chat, 'modal', ev.data);
            }
          }

        } catch(e) {
          logError('Error processing message:', e);
        }
      });

      // ===== KEYBOARD HANDLER (ESC to close) =====
      document.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape' || ev.key === 'Esc') {
          if (isAnyModalOpen()) {
            closeAll();
            ev.preventDefault();
            ev.stopPropagation();
            log('Closed via ESC key');
          }
        }
      });

      // ===== INITIALIZATION =====
      (function initializeOverlayControls() {
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'dpac-backdrop';
        backdrop.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(2px);
          z-index: 2147482999;
          display: none;
          transition: opacity 0.2s ease;
        \`;
        backdrop.addEventListener('click', function() {
          log('Closed via backdrop click');
          closeAll();
        });
        document.body.appendChild(backdrop);

        // Create emergency close button
        const emergencyBtn = document.createElement('button');
        emergencyBtn.id = 'dpac-emergency-close';
        emergencyBtn.setAttribute('aria-label', 'Chiudi il widget');
        emergencyBtn.setAttribute('title', 'Chiudi');
        emergencyBtn.style.cssText = \`
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
          font-weight: bold;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        \`;
        emergencyBtn.innerHTML = '✕';
        emergencyBtn.addEventListener('click', function() {
          log('Closed via emergency button');
          closeAll();
        });
        emergencyBtn.addEventListener('mouseenter', function() {
          this.style.background = 'rgba(239, 68, 68, 0.9)';
          this.style.transform = 'scale(1.1)';
        });
        emergencyBtn.addEventListener('mouseleave', function() {
          this.style.background = 'rgba(0, 0, 0, 0.7)';
          this.style.transform = 'scale(1)';
        });
        document.body.appendChild(emergencyBtn);

        log('Backdrop and emergency close button initialized');
      })();

      // ===== RESIZE HANDLER =====
      window.addEventListener('resize', function() {
        if (picker && picker.style.display === 'block') { 
          if(enoughWidth(2)) placeTwo(); 
        }
      });

      // ===== FINAL INITIALIZATION LOG =====
      log('DPaC Widget Host initialized');
      log('Allowed origin:', ALLOWED_ORIGIN);
      log('Waiting for iframes to load...');

    })();
  `;

  return (
    <>
      {/* Launcher iframe - fixed bottom-right */}
      <iframe
        id="dpac-launcher"
        src="/dpac/launcher"
        title="DPaC Launcher"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 60, height: 60, border: 'none', zIndex: 2147483000, background: 'transparent' }}
      />

      {/* Chat Modal */}
      <iframe
        id="dpac-modal"
        src="/dpac/modal"
        title="DPaC Modal"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483001, display: 'none', background: 'transparent' }}
      />

      {/* Source Picker */}
      <iframe
        id="dpac-source-picker"
        src="/dpac/source-picker"
        title="DPaC Source Picker"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483002, display: 'none', background: 'transparent' }}
      />

      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}