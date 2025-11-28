"use client";

import React, { useEffect, useState } from "react";

interface FileData {
  name: string;
  fullPath: string;
  size: number;
}

interface ProjectData {
  name: string;
  files: FileData[];
  isLoading: boolean;
}

export default function FileSelectCard(): React.ReactElement {
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Notify parent that file select is loaded
  useEffect(() => {
    try {
      if (window && window.parent) {
        window.parent.postMessage(
          { type: "dpac.widget.loaded", payload: { source: "fileSelect" } },
          "*"
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for selected projects from SourcePicker
  useEffect(() => {
    console.log('🎧 FileSelect: Listening for messages...');
    
    const handleMessage = async (event: MessageEvent) => {
      console.log('📨 FileSelect: Message received:', event.data?.type);
      
      if (event.data?.type === "dpac.widget.openFileSelect") {
        const selectedProjects = event.data.payload?.projects || [];
        console.log('📋 FileSelect: Received selected projects:', selectedProjects);
        
        if (selectedProjects.length > 0) {
          setIsInitializing(false);
          
          // Initialize projects with loading state
          const initialProjects: ProjectData[] = selectedProjects.map((name: string) => ({
            name,
            files: [],
            isLoading: true
          }));
          
          setProjects(initialProjects);
          setExpandedProjects([selectedProjects[0]]); // Auto-expand first one
          
          // Load files for each project
          for (const projectName of selectedProjects) {
            try {
              const response = await fetch(`/api/minio/files?bucket=dpac&folder=${encodeURIComponent(projectName)}`);
              const data = await response.json();
              
              if (data.success && data.files) {
                setProjects(prev => prev.map(p => 
                  p.name === projectName 
                    ? { ...p, files: data.files, isLoading: false }
                    : p
                ));
                console.log(`✅ Files loaded for ${projectName}:`, data.files.length);
              }
            } catch (error) {
              console.error(`❌ Error loading files for ${projectName}:`, error);
              setProjects(prev => prev.map(p => 
                p.name === projectName 
                  ? { ...p, isLoading: false }
                  : p
              ));
            }
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
    projectRow: {
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
    projectText: {
      fontSize: 12,
      fontWeight: 600 as const,
      color: "#111827",
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
    innerCard: {
      marginTop: 8,
      border: "1px solid #F1F5F9",
      borderRadius: 8,
      padding: 12,
      background: "#fff",
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    },
    fileRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      color: "#374151",
      fontSize: 12,
      cursor: "pointer",
      transition: "all 0.2s ease",
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

  // Projects are now loaded from MinIO API (see useEffect above)

  const toggleProject = (projectName: string) => {
    setExpandedProjects(prev =>
      prev.includes(projectName)
        ? prev.filter(p => p !== projectName)
        : [...prev, projectName]
    );
  };

  const toggleFile = (fullPath: string) => {
    setSelectedFiles(prev =>
      prev.includes(fullPath)
        ? prev.filter(f => f !== fullPath)
        : [...prev, fullPath]
    );
  };

  const close = () => { 
    try { window?.parent?.postMessage({ type: "dpac.widget.closeFileSelect" }, "*"); } catch {} 
  };
  
  const confirm = () => {
    if (selectedFiles.length > 0) {
      try {
        window?.parent?.postMessage(
          { type: "dpac.widget.filesSelected", payload: { files: selectedFiles } },
          "*"
        );
      } catch {}
    }
  };

  return (
    <div style={styles.container as any}>
      {/* Header */}
      <div style={styles.header as any}>
        <h3 style={styles.headerTitle as any}>Seleziona file</h3>
        <button aria-label="Close" title="Close" onClick={close} style={styles.closeBtn as any}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={iconStyle}>
            <path d="M1 1l12 12M13 1L1 13" stroke="#000" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchWrap as any}>
        <div style={styles.search as any}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden style={{ ...iconStyle, color: "#A0A8AC" }}>
            <path fill="#A0A8AC" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20l-6-6zm-6 0C8.01 14 6 11.99 6 9.5S8.01 5 10.5 5 15 7.01 15 9.5 12.99 14 10.5 14z" />
          </svg>
          <input placeholder="Cerca file..." aria-label="Cerca file" style={styles.searchInput as any} />
        </div>
      </div>

      {/* Projects list */}
      <div style={styles.list as any}>
        {isInitializing ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Seleziona una fonte prima...
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Nessun progetto selezionato
          </div>
        ) : (
          projects.map((project, idx) => {
            const isExpanded = expandedProjects.includes(project.name);
            const projectFiles = project.files;
            const projectSelectedCount = projectFiles.filter(f => selectedFiles.includes(f.fullPath)).length;
            const isProjectHovered = hoveredItem === project.name;

          return (
            <div key={project.name}>
              {idx > 0 && <div style={{ height: 12 }} />}
              
              {/* Project row */}
              <div 
                style={{
                  ...(styles.projectRow as any),
                  background: isProjectHovered ? "#F9FAFB" : "#FFFFFF",
                }}
                onClick={() => toggleProject(project.name)}
                onMouseEnter={() => setHoveredItem(project.name)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <div style={styles.left as any}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden style={iconStyle}>
                    <path 
                      fill="#111827" 
                      d={isExpanded ? "M9 18l6-6-6-6" : "M8 5l8 7-8 7"} 
                    />
                  </svg>
                  <div style={styles.folderCircle as any}>
                    <img src="/dpac-embed/images/srclogo.svg" alt="folder" style={{ width: 16, height: 16, display: 'block' }} />
                  </div>
                  <span style={styles.projectText as any}>
                    {project.name}
                    {projectSelectedCount > 0 && ` (${projectSelectedCount})`}
                  </span>
                </div>
                <div style={{
                  ...(styles.checkbox as any),
                  ...(projectSelectedCount === projectFiles.length && projectFiles.length > 0 ? styles.checkboxChecked : {})
                }}>
                  {projectSelectedCount === projectFiles.length && projectFiles.length > 0 && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3 3 7-7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Files (shown when expanded) */}
              {isExpanded && (
                <div style={styles.innerCard as any}>
                  {project.isLoading ? (
                    <div style={{ textAlign: 'center', padding: '10px', color: '#A0A8AC', fontSize: 11 }}>
                      Caricamento file...
                    </div>
                  ) : projectFiles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10px', color: '#A0A8AC', fontSize: 11 }}>
                      Nessun file trovato
                    </div>
                  ) : (
                    projectFiles.map((file) => {
                      const isFileSelected = selectedFiles.includes(file.fullPath);
                      const isFileHovered = hoveredItem === file.fullPath;
                      return (
                        <div 
                          key={file.fullPath}
                          style={{
                            ...(styles.fileRow as any),
                            background: isFileHovered ? "#F9FAFB" : "transparent",
                            padding: "8px 0",
                            borderRadius: 4,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFile(file.fullPath);
                          }}
                          onMouseEnter={() => setHoveredItem(file.fullPath)}
                          onMouseLeave={() => setHoveredItem(null)}
                        >
                          <span>{file.name}</span>
                          <div style={{
                            ...(styles.checkbox as any),
                            ...(isFileSelected ? styles.checkboxChecked : {})
                          }}>
                            {isFileSelected && (
                              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                                <path d="M1 5l3 3 7-7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
        )}
      </div>

      {/* Footer */}
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
            opacity: selectedFiles.length === 0 ? 0.5 : 1,
            cursor: selectedFiles.length === 0 ? "not-allowed" : "pointer"
          }} 
          onClick={confirm}
          disabled={selectedFiles.length === 0}
          onMouseEnter={(e) => {
            if (selectedFiles.length > 0) {
              e.currentTarget.style.background = "#2A3D52";
            }
          }}
          onMouseLeave={(e) => e.currentTarget.style.background = "#334C66"}
        >
          Conferma selezione {selectedFiles.length > 0 && `(${selectedFiles.length})`}
        </button>
      </div>
    </div>
  );
}

