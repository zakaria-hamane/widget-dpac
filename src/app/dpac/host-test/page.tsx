"use client";

export default function HostTestPage() {
  const script = `
    (function(){
      // ===== CONSTANTS =====
      const GAP = 8;
      const CARD_W = 294, CARD_H = 418;
      const MARGIN = 20;
      const DEBUG = true; // Set to false in production

      // ===== SECURITY: Get allowed origin =====
      const ALLOWED_ORIGIN = window.location.origin;

      // ===== DOM REFERENCES =====
      const launcher = document.getElementById('dpac-launcher');
      const chat = document.getElementById('dpac-modal');
      const picker = document.getElementById('dpac-source-picker');
      const fileSel = document.getElementById('dpac-file-select');

      // ===== IFRAME LIFECYCLE STATE =====
      const iframeState = {
        launcher: false,
        modal: false,
        sourcePicker: false,
        fileSelect: false
      };

      // ===== LOAD TIMEOUT TRACKING =====
      const loadTimeouts = {
        modal: null,
        sourcePicker: null,
        fileSelect: null
      };

      // ===== MESSAGE QUEUE (for messages sent before iframe is ready) =====
      const messageQueue = {
        modal: [],
        sourcePicker: [],
        fileSelect: []
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
               (picker && picker.style.display === 'block') ||
               (fileSel && fileSel.style.display === 'block');
      }

      function closeAll() {
        hide(chat);
        hide(picker);
        hide(fileSel);
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
            
            // Afficher un message d'erreur dans l'iframe
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
              <h3 style="margin: 0 0 8px 0; color: #111; font-size: 16px;">Widget non disponible</h3>
              <p style="margin: 0 0 16px 0; color: #666; font-size: 13px;">Le widget ne répond pas. Vérifiez votre connexion.</p>
              <button id="error-close-btn" style="
                padding: 8px 16px;
                background: #334C66;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">Fermer</button>
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
        }, 10000); // 10 secondes
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

      function placeThree() { 
        if(!chat||!picker||!fileSel) return; 
        fileSel.style.right = MARGIN+'px'; 
        fileSel.style.bottom = MARGIN+'px'; 
        picker.style.right = (MARGIN + CARD_W + GAP)+'px'; 
        picker.style.bottom = MARGIN+'px'; 
        chat.style.right = (MARGIN + 2*(CARD_W + GAP))+'px'; 
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

      // ===== IFRAME READY CHECK =====
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

      function processQueuedMessages(iframeName) {
        const queue = messageQueue[iframeName];
        if (!queue || queue.length === 0) return;

        log('Processing', queue.length, 'queued messages for', iframeName);
        while (queue.length > 0) {
          const msg = queue.shift();
          const iframeEl = iframeName === 'modal' ? chat :
                          iframeName === 'sourcePicker' ? picker :
                          iframeName === 'fileSelect' ? fileSel : null;
          if (iframeEl) {
            sendToIframe(iframeEl, iframeName, msg);
          }
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
            // Silently ignore invalid messages (could be from other scripts)
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
              
              // Clear load timeout
              if (loadTimeouts[source]) {
                clearTimeout(loadTimeouts[source]);
                loadTimeouts[source] = null;
              }
              
              // Process any queued messages
              if (source !== 'launcher') {
                processQueuedMessages(source);
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
              // stack picker above chat
              picker.style.right = (MARGIN + Math.max(0, Math.floor((CARD_W - CARD_W)/2)))+'px'; 
              picker.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
              placeOne(); 
            }
            updateEmergencyClose();
            startLoadTimeout('sourcePicker', picker);
          }

          if (msgType === 'dpac.widget.closeSourcePicker') { 
            hide(picker); 
            if (fileSel && fileSel.style.display === 'block') { 
              if(enoughWidth(2)) { 
                // fileSel + chat
                fileSel.style.right = MARGIN+'px'; 
                fileSel.style.bottom = MARGIN+'px'; 
                chat.style.right = (MARGIN + CARD_W + GAP)+'px';
              } else { 
                // vertical
                fileSel.style.right = MARGIN+'px'; 
                fileSel.style.bottom = MARGIN+'px'; 
                chat.style.right = MARGIN+'px'; 
                chat.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
              }
            } else { 
              placeOne(); 
            }
            updateEmergencyClose();
          }

          if (msgType === 'dpac.widget.openFileSelect') { 
            show(fileSel); 
            
            // Forward the message to FileSelect iframe with payload
            if (fileSel && fileSel.contentWindow) {
              sendToIframe(fileSel, 'fileSelect', ev.data);
            }
            
            if (picker && picker.style.display === 'block') { 
              if(enoughWidth(3)) {
                placeThree(); 
              } else { 
                // vertical stack
                fileSel.style.right = MARGIN+'px'; 
                fileSel.style.bottom = MARGIN+'px'; 
                picker.style.right = MARGIN+'px'; 
                picker.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
                chat.style.right = MARGIN+'px'; 
                chat.style.bottom = (MARGIN + 2*(CARD_H + GAP))+'px'; 
              }
            } else { 
              // no picker, align file + chat
              if(enoughWidth(2)) { 
                fileSel.style.right = MARGIN+'px'; 
                fileSel.style.bottom = MARGIN+'px'; 
                chat.style.right = (MARGIN + CARD_W + GAP)+'px'; 
                chat.style.bottom = MARGIN+'px'; 
              } else { 
                // vertical
                fileSel.style.right = MARGIN+'px'; 
                fileSel.style.bottom = MARGIN+'px'; 
                chat.style.right = MARGIN+'px'; 
                chat.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
              }
            }
            updateEmergencyClose();
            startLoadTimeout('fileSelect', fileSel);
          }

          if (msgType === 'dpac.widget.closeFileSelect') { 
            hide(fileSel); 
            if (picker && picker.style.display === 'block') { 
              if(enoughWidth(2)) {
                placeTwo(); 
              } else { 
                picker.style.right = MARGIN+'px'; 
                picker.style.bottom = MARGIN+'px'; 
                chat.style.right = MARGIN+'px'; 
                chat.style.bottom = (MARGIN + CARD_H + GAP)+'px'; 
              } 
            } else { 
              placeOne(); 
            }
            updateEmergencyClose();
          }

          if (msgType === 'dpac.widget.filesSelected') {
            log('Files selected:', payload);
            // Here you would typically process the selected files
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

      // ===== INITIALIZATION - Create backdrop and emergency close button =====
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
        emergencyBtn.setAttribute('aria-label', 'Fermer le widget');
        emergencyBtn.setAttribute('title', 'Fermer');
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
        if (fileSel && fileSel.style.display === 'block') { 
          if(picker && picker.style.display === 'block') { 
            if(enoughWidth(3)) placeThree(); 
          } else { 
            if(enoughWidth(2)) { 
              fileSel.style.right = MARGIN+'px'; 
              chat.style.right = (MARGIN + CARD_W + GAP)+'px'; 
            } 
          }
        } else if (picker && picker.style.display === 'block') { 
          if(enoughWidth(2)) placeTwo(); 
        }
      });

      // ===== FINAL INITIALIZATION LOG =====
      log('DPaC Widget Host initialized');
      log('Allowed origin:', ALLOWED_ORIGIN);
      log('Waiting for iframes to load...');
      log('Emergency controls ready: backdrop + emergency close button');

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

      {/* Chat (card 1) */}
      <iframe
        id="dpac-modal"
        src="/dpac/modal?src=about:blank"
        title="DPaC Modal"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483001, display: 'none', background: 'transparent' }}
      />

      {/* Source Picker (card 2) */}
      <iframe
        id="dpac-source-picker"
        src="/dpac/source-picker"
        title="DPaC Source Picker"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483002, display: 'none', background: 'transparent' }}
      />

      {/* File Select (card 3) */}
      <iframe
        id="dpac-file-select"
        src="/dpac/file-select"
        title="DPaC File Select"
        style={{ position: 'fixed', bottom: 20, right: 20, width: 294, height: 418, border: 'none', zIndex: 2147483003, display: 'none', background: 'transparent' }}
      />

      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}

