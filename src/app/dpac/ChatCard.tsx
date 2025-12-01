"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

const COLORS = {
  primary: "#334C66",
  lightText: "#FCF7E6",
  accent: "#66CCC9",
  border: "#E8EBEC",
  grayText: "#A0A8AC",
};

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// Polling configuration
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 60;  // Max 2 minutes of polling

export default function ChatCard(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Sto pensando...");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  // Notify parent that modal is loaded
  useEffect(() => {
    try {
      if (window && window.parent) {
        window.parent.postMessage(
          { type: "dpac.widget.loaded", payload: { source: "modal" } },
          "*"
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for selected files from FileSelect
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "dpac.widget.filesSelected") {
        const files = event.data.payload?.files || [];
        setSelectedFiles(files);
        console.log('ðŸ“Ž ChatCard: Files selected:', files);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const handleClose = () => {
    // Abort any ongoing polling
    pollAbortRef.current?.abort();
    try {
      if (window && window.parent) {
        window.parent.postMessage({ type: "dpac.widget.close" }, "*");
      }
    } catch {
      // ignore
    }
  };

  const handleOpenSourcePicker = () => {
    try {
      if (window && window.parent) {
        window.parent.postMessage({ type: "dpac.widget.openSourcePicker" }, "*");
      }
    } catch {}
  };

  /**
   * Poll Celery/Flower for the task result
   */
  const pollForResponse = useCallback(async (
    requestTime: number,
    tasks: Array<{ task_id: string; step_name: string; status: string }>
  ): Promise<string | null> => {
    // Create abort controller for this polling session
    pollAbortRef.current = new AbortController();
    const signal = pollAbortRef.current.signal;

    const loadingMessages = [
      "Sto elaborando la tua domanda...",
      "Analizzo i documenti...",
      "Cerco informazioni rilevanti...",
      "Preparo la risposta...",
      "Ancora un momento...",
    ];

    // Find the final task that will contain the LLM output
    const finalTask = tasks.find(t => 
      t.step_name === 'combine_vector_response_and_references' ||
      t.step_name === 'combine_response_and_references'
    ) || tasks[tasks.length - 1];

    if (!finalTask) {
      console.error('No final task found in workflow');
      return null;
    }

    console.log('ðŸŽ¯ Polling for response after:', new Date(requestTime).toISOString());

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (signal.aborted) {
        console.log('ðŸ›‘ Polling aborted');
        return null;
      }

      // Update loading message
      setLoadingText(loadingMessages[Math.min(attempt, loadingMessages.length - 1)]);

      try {
        console.log(`ðŸ”„ Polling attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}`);

        const params = new URLSearchParams({
          task_id: finalTask.task_id,
          request_time: requestTime.toString(),
        });

        const response = await fetch(`/api/chat/poll?${params}`, {
          signal,
        });

        if (!response.ok) {
          console.error('Poll request failed:', response.status);
          continue;
        }

        const data = await response.json();

        if (data.found && data.message?.content) {
          console.log('âœ… Response found:', data.message.content.substring(0, 100));
          return data.message.content;
        }

        if (data.state === 'FAILURE') {
          console.error('âŒ Task failed');
          return null;
        }

        console.log('â³ Task state:', data.state || 'PENDING');
      } catch (error) {
        if (signal.aborted) {
          return null;
        }
        console.error('Poll error:', error);
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    console.log('âš ï¸ Polling timeout reached');
    return null;
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    const messageTimestamp = new Date().toISOString();
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setLoadingText("Sto pensando...");

    try {
      const payload = {
        question: inputValue,
        files: selectedFiles,
        domain_id: "dpac",
        language: "it",
        session_id: sessionId,
      };
      
      console.log('ðŸ“¤ ChatCard: Sending to API:', payload);
      
      // Record request time for polling (to filter old tasks)
      const requestTime = Date.now();
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('ðŸ“¨ ChatCard: Received response:', data);
      
      let responseContent = "";
      
      // Check if it's an async workflow response
      if (data.workflow_id && data.tasks) {
        console.log('ðŸ”„ Async workflow initiated:', data.workflow_id);
        console.log('ðŸ“‹ Tasks:', data.tasks.map((t: { step_name: string }) => t.step_name).join(', '));
        
        // Add a streaming placeholder message
        const streamingMessage: Message = {
          role: "assistant",
          content: "Elaborazione in corso...",
          timestamp: new Date(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, streamingMessage]);
        
        // Poll Celery/Flower for the task result using the request timestamp
        const actualResponse = await pollForResponse(requestTime, data.tasks);
        
        // Remove the streaming placeholder and add the real response
        setMessages((prev) => {
          const filtered = prev.filter(m => !m.isStreaming);
          const finalMessage: Message = {
            role: "assistant",
            content: actualResponse || "Mi dispiace, non sono riuscito a elaborare la risposta. Riprova.",
            timestamp: new Date(),
          };
          return [...filtered, finalMessage];
        });
        
        setIsLoading(false);
        return;
        
      } else if (data.answer || data.response) {
        // Direct response
        responseContent = data.answer || data.response;
      } else {
        // No recognizable response
        responseContent = "Nessuna risposta ricevuta.";
        console.warn('âš ï¸ Unknown response format:', data);
      }
      
      const assistantMessage: Message = {
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Remove any streaming messages
      setMessages((prev) => {
        const filtered = prev.filter(m => !m.isStreaming);
        const errorMessage: Message = {
          role: "assistant",
          content: "Mi dispiace, si Ã¨ verificato un errore. Riprova piÃ¹ tardi.",
          timestamp: new Date(),
        };
        return [...filtered, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      style={{
        width: 294,
        height: 418,
        borderRadius: 8,
        boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
        overflow: "hidden",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: COLORS.primary,
          height: 47,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
        }}
      >
        {/* DPAC logo from provided asset */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src="/dpac-embed/images/dpac-logo.svg"
            alt="DPaC logo"
            style={{ height: 20, display: "block" }}
          />
        </div>

        {/* Close button */}
        <button
          aria-label="Close"
          title="Chiudi"
          onClick={handleClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Body - Messages */}
      <div 
        style={{ 
          flex: 1, 
          padding: 16, 
          background: "#fff",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 ? (
          <>
            <h1 style={{ margin: 0, marginBottom: 8, fontSize: 18, color: "#111" }}>
              Ciao sono il tuo assistente
            </h1>
            <p style={{ margin: 0, color: COLORS.grayText, fontSize: 12, lineHeight: 1.4 }}>
              Posso aiutarti a trovare informazioni e rispondere alle tue domande.
            </p>
          </>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: msg.role === "user" ? COLORS.primary : "#F3F4F6",
                    color: msg.role === "user" ? "#fff" : "#111",
                    fontSize: 12,
                    lineHeight: 1.5,
                    wordWrap: "break-word",
                    opacity: msg.isStreaming ? 0.7 : 1,
                  }}
                >
                  {msg.content}
                  {msg.isStreaming && (
                    <span style={{ marginLeft: 4 }} className="typing-dots">
                      <style>{`
                        @keyframes typing {
                          0%, 60%, 100% { opacity: 0; }
                          30% { opacity: 1; }
                        }
                        .typing-dots span {
                          animation: typing 1.4s infinite;
                          animation-fill-mode: both;
                        }
                        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
                        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
                      `}</style>
                      <span>.</span><span>.</span><span>.</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {isLoading && !messages.some(m => m.isStreaming) && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#F3F4F6",
                    fontSize: 12,
                    color: COLORS.grayText,
                  }}
                >
                  {loadingText}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          background: "#fff",
          padding: "10px 8px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Fonte button */}
        <button
          type="button"
          title="Fonte"
          onClick={handleOpenSourcePicker}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            background: COLORS.border,
            color: "#333",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            whiteSpace: "nowrap",
            transition: "all 0.2s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#D8DBDD"}
          onMouseLeave={(e) => e.currentTarget.style.background = COLORS.border}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <rect x="2" y="2" width="10" height="10" rx="2" fill="#BDC4C8" />
            <rect x="4" y="4" width="6" height="1.5" rx="0.75" fill="#FFFFFF" />
            <rect x="4" y="7" width="6" height="1.5" rx="0.75" fill="#FFFFFF" />
          </svg>
          Fonte
        </button>

        {/* Input */}
        <input
          placeholder="Digita il tuo messaggio..."
          aria-label="Digita il tuo messaggio"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          style={{
            flex: 1,
            height: 32,
            padding: "0 10px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            fontSize: 12,
            outline: "none",
            opacity: isLoading ? 0.6 : 1,
          }}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow = `0 0 0 2px ${COLORS.accent}33`)
          }
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />

        {/* Send button */}
        <button
          type="button"
          title="Invia"
          onClick={handleSendMessage}
          disabled={isLoading || !inputValue.trim()}
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: COLORS.primary,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isLoading || !inputValue.trim() ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            flexShrink: 0,
            opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isLoading && inputValue.trim()) {
              e.currentTarget.style.background = "#2A3D52";
            }
          }}
          onMouseLeave={(e) => e.currentTarget.style.background = COLORS.primary}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
              fill="#FFFFFF"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}