"use client";

import React, { useEffect, useState } from "react";

export default function SourceCard(): React.ReactElement {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [folders, setFolders] = useState<Array<{ name: string; prefix: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Notify parent that source picker is loaded
  useEffect(() => {
    try {
      if (window && window.parent) {
        window.parent.postMessage(
          { type: "dpac.widget.loaded", payload: { source: "sourcePicker" } },
          "*"
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Load folders from MinIO
  useEffect(() => {
    const loadFolders = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/minio/folders?bucket=dpac');
        const data = await response.json();
        
        if (data.success && data.folders) {
          setFolders(data.folders);
          console.log('✅ Folders loaded from MinIO:', data.folders);
        } else {
          console.error('❌ Failed to load folders:', data);
        }
      } catch (error) {
        console.error('❌ Error loading folders:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFolders();
  }, []);

  const iconStyle: React.CSSProperties = { display: "block", overflow: "visible" };

  const styles = {
    container: {
      width: 294,
      height: 418,
      background: "#FFFFFF",
      border: "0.5px solid #E8EBEC",
      borderRadius: 8,
      boxShadow: "0px 4px 4px rgba(0,0,0,0.06)",
      overflow: "hidden" as const,
      fontFamily: "sans-serif",
      fontSize: 12,
      display: "flex",
      flexDirection: "column" as const,
    },
    header: {
      position: "relative" as const,
      padding: "12px 16px",
      borderBottom: "0.524px solid #E8EBEC",
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: 600 as const,
      color: "#000000",
      margin: 0,
    },
    closeBtn: {
      position: "absolute" as const,
      right: 12,
      top: 10,
      width: 24,
      height: 24,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      borderRadius: 6,
    },
    searchWrap: {
      padding: "14px 17px",
    },
    search: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 36,
      border: "0.663px solid #E8EBEC",
      borderRadius: 6.3,
      padding: "0 10px",
    },
    searchInput: {
      border: "none",
      outline: "none",
      flex: 1,
      fontSize: 12,
    },
    list: {
      flex: 1,
      overflowY: "auto" as const,
      padding: "0 12px",
    },
    item: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      background: "#FFFFFF",
      border: "1px solid #F1F5F9",
      borderRadius: 8,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },
    left: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      lineHeight: 0 as const,
      marginLeft: 12,
    },
    folderCircle: {
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: "#FCF7E6",
      display: "grid",
      placeItems: "center",
    },
    itemText: {
      fontSize: 12,
      color: "#000000",
      fontWeight: 600 as const,
      lineHeight: 1.2,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      border: "2px solid #CBD5E1",
      background: "#fff",
      boxSizing: "border-box" as const,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
    },
    checkboxChecked: {
      background: "#334C66",
      borderColor: "#334C66",
    },
    footer: {
      borderTop: "0.524px solid #E8EBEC",
      padding: "12px",
      display: "flex",
      alignItems: "center",
      gap: 10,
    },
    cancelBtn: {
      width: 120,
      height: 36,
      background: "#FFFFFF",
      border: "0.524px solid #E8EBEC",
      color: "#A0A8AC",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 12,
      transition: "all 0.2s ease",
    },
    confirmBtn: {
      flex: 1,
      height: 36,
      background: "#334C66",
      color: "#FFFFFF",
      border: "none",
      borderRadius: 6,
      fontWeight: 500 as const,
      cursor: "pointer",
      fontSize: 12,
      transition: "all 0.2s ease",
    },
  } as const;

  // Items are now loaded from MinIO API (see useEffect above)

  const toggleProject = (project: string) => {
    setSelectedProjects(prev =>
      prev.includes(project)
        ? prev.filter(p => p !== project)
        : [...prev, project]
    );
  };

  const close = () => {
    try { window?.parent?.postMessage({ type: "dpac.widget.closeSourcePicker" }, "*"); } catch {}
  };

  const openFileSelect = () => {
    if (selectedProjects.length > 0) {
      console.log('📤 SourcePicker: Sending selected projects to FileSelect:', selectedProjects);
      try { 
        window?.parent?.postMessage({ 
          type: "dpac.widget.openFileSelect", 
          payload: { projects: selectedProjects } 
        }, "*"); 
        console.log('✅ SourcePicker: Message sent successfully');
      } catch (error) {
        console.error('❌ SourcePicker: Error sending message:', error);
      }
    } else {
      console.warn('⚠️ SourcePicker: No projects selected');
    }
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.header as any}>
        <h3 style={styles.headerTitle as any}>Seleziona fonti</h3>
        <button aria-label="Close" title="Close" onClick={close} style={styles.closeBtn as any}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={iconStyle}>
            <path d="M1 1l12 12M13 1L1 13" stroke="#000" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={styles.searchWrap as any}>
        <div style={styles.search as any}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden style={{ ...iconStyle, color: "#A0A8AC" }}>
            <path fill="#A0A8AC" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20l-6-6zm-6 0C8.01 14 6 11.99 6 9.5S8.01 5 10.5 5 15 7.01 15 9.5 12.99 14 10.5 14z" />
          </svg>
          <input placeholder="Cerca progetti o file..." aria-label="Cerca progetti o file" style={styles.searchInput as any} />
        </div>
      </div>

      <div style={styles.list as any}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Caricamento fonti...
          </div>
        ) : folders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Nessuna fonte disponibile
          </div>
        ) : (
          folders.map((folder) => {
            const isSelected = selectedProjects.includes(folder.name);
            const isHovered = hoveredItem === folder.name;
            return (
              <div key={folder.name} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    ...(styles.item as any),
                    background: isHovered ? "#F9FAFB" : "#FFFFFF",
                    borderColor: isSelected ? "#334C66" : "#F1F5F9",
                  }}
                  onClick={() => toggleProject(folder.name)}
                  onMouseEnter={() => setHoveredItem(folder.name)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <div style={styles.left as any}>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden style={iconStyle}>
                      <path fill="#111827" d={"M8 5l8 7-8 7"} />
                    </svg>
                    <div style={styles.folderCircle as any}>
                      <img
                        src="/dpac-embed/images/srclogo.svg"
                        alt="folder"
                        style={{ width: 16, height: 16, display: "block" }}
                      />
                    </div>
                    <span style={styles.itemText as any}>{folder.name}</span>
                  </div>
                  <div style={{
                    ...(styles.checkbox as any),
                    ...(isSelected ? styles.checkboxChecked : {})
                  }}>
                    {isSelected && (
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3 3 7-7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={styles.footer as any}>
        <button 
          type="button" 
          style={styles.cancelBtn as any} 
          onClick={close}
          onMouseEnter={(e) => e.currentTarget.style.background = "#F9FAFB"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#FFFFFF"}
        >
          Annulla
        </button>
        <button 
          type="button" 
          style={{
            ...(styles.confirmBtn as any),
            opacity: selectedProjects.length === 0 ? 0.5 : 1,
            cursor: selectedProjects.length === 0 ? "not-allowed" : "pointer"
          }} 
          onClick={openFileSelect}
          disabled={selectedProjects.length === 0}
          onMouseEnter={(e) => {
            if (selectedProjects.length > 0) {
              e.currentTarget.style.background = "#2A3D52";
            }
          }}
          onMouseLeave={(e) => e.currentTarget.style.background = "#334C66"}
        >
          Conferma selezione
        </button>
      </div>
    </div>
  );
}

