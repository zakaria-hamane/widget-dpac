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

export default function SourceCard(): React.ReactElement {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
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
          // Initialize projects with empty files
          const initialProjects: ProjectData[] = data.folders.map((folder: { name: string }) => ({
            name: folder.name,
            files: [],
            isLoading: false
          }));
          setProjects(initialProjects);
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
      color: "#000000",
      fontWeight: 600 as const,
      lineHeight: 1.2,
    },
    radioButton: {
      width: 20,
      height: 20,
      borderRadius: "50%",
      border: "2px solid #CBD5E1",
      background: "#fff",
      boxSizing: "border-box" as const,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
    },
    radioButtonSelected: {
      borderColor: "#334C66",
    },
    radioButtonInner: {
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "#334C66",
    },
    filesContainer: {
      marginTop: 8,
      marginLeft: 46,
      padding: "8px 0",
    },
    fileItem: {
      padding: "6px 8px",
      fontSize: 11,
      color: "#666",
      borderRadius: 4,
      marginBottom: 4,
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

  const toggleProject = (projectName: string) => {
    // Radio button behavior - only one can be selected
    setSelectedProject(prev => prev === projectName ? "" : projectName);
  };

  const toggleExpanded = async (projectName: string) => {
    const isExpanded = expandedProjects.includes(projectName);
    
    if (isExpanded) {
      // Collapse
      setExpandedProjects(prev => prev.filter(p => p !== projectName));
    } else {
      // Expand and load files if not already loaded
      setExpandedProjects(prev => [...prev, projectName]);
      
      const project = projects.find(p => p.name === projectName);
      if (project && project.files.length === 0 && !project.isLoading) {
        // Load files for this project
        setProjects(prev => prev.map(p => 
          p.name === projectName ? { ...p, isLoading: true } : p
        ));
        
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
  };

  const close = () => {
    try { 
      window?.parent?.postMessage({ type: "dpac.widget.closeSourcePicker" }, "*"); 
    } catch {}
  };

  const confirmSelection = () => {
    if (selectedProject) {
      console.log('📤 SourcePicker: Sending selected project to Chat:', selectedProject);
      try { 
        // Send the selected project directly to chat
        window?.parent?.postMessage({ 
          type: "dpac.widget.projectSelected", 
          payload: { project: selectedProject } 
        }, "*");
        // Close the source picker
        window?.parent?.postMessage({ type: "dpac.widget.closeSourcePicker" }, "*");
        console.log('✅ SourcePicker: Message sent successfully');
      } catch (error) {
        console.error('❌ SourcePicker: Error sending message:', error);
      }
    }
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.header as any}>
        <h3 style={styles.headerTitle as any}>Seleziona fonte</h3>
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
          <input placeholder="Cerca progetti..." aria-label="Cerca progetti" style={styles.searchInput as any} />
        </div>
      </div>

      <div style={styles.list as any}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Caricamento fonti...
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#A0A8AC', fontSize: 12 }}>
            Nessuna fonte disponibile
          </div>
        ) : (
          projects.map((project) => {
            const isSelected = selectedProject === project.name;
            const isExpanded = expandedProjects.includes(project.name);
            const isProjectHovered = hoveredItem === project.name;
            
            return (
              <div key={project.name} style={{ marginBottom: 12 }}>
                {/* Project row */}
                <div
                  style={{
                    ...(styles.projectRow as any),
                    background: isProjectHovered ? "#F9FAFB" : "#FFFFFF",
                    borderColor: isSelected ? "#334C66" : "#F1F5F9",
                  }}
                  onMouseEnter={() => setHoveredItem(project.name)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <div 
                    style={{ ...styles.left as any, flex: 1, cursor: 'pointer' }}
                    onClick={() => toggleProject(project.name)}
                  >
                    {/* Expand/Collapse Arrow */}
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      aria-hidden 
                      style={{ 
                        ...iconStyle,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(project.name);
                      }}
                    >
                      <path fill="#111827" d="M8 5l8 7-8 7" />
                    </svg>
                    
                    <div style={styles.folderCircle as any}>
                      <img
                        src="/dpac-embed/images/srclogo.svg"
                        alt="folder"
                        style={{ width: 16, height: 16, display: "block" }}
                      />
                    </div>
                    <span style={styles.projectText as any}>{project.name}</span>
                  </div>
                  
                  {/* Radio Button */}
                  <div 
                    style={{
                      ...(styles.radioButton as any),
                      ...(isSelected ? styles.radioButtonSelected : {})
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProject(project.name);
                    }}
                  >
                    {isSelected && (
                      <div style={styles.radioButtonInner as any}></div>
                    )}
                  </div>
                </div>

                {/* Files dropdown (no checkboxes, just view) */}
                {isExpanded && (
                  <div style={styles.filesContainer as any}>
                    {project.isLoading ? (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '10px', 
                        color: '#A0A8AC', 
                        fontSize: 11 
                      }}>
                        Caricamento file...
                      </div>
                    ) : project.files.length === 0 ? (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '10px', 
                        color: '#A0A8AC', 
                        fontSize: 11 
                      }}>
                        Nessun file trovato
                      </div>
                    ) : (
                      project.files.map((file) => {
                        const isFileHovered = hoveredItem === file.fullPath;
                        return (
                          <div 
                            key={file.fullPath}
                            style={{
                              ...(styles.fileItem as any),
                              background: isFileHovered ? "#F3F4F6" : "transparent",
                            }}
                            onMouseEnter={() => setHoveredItem(file.fullPath)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            📄 {file.name}
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
            opacity: !selectedProject ? 0.5 : 1,
            cursor: !selectedProject ? "not-allowed" : "pointer"
          }} 
          onClick={confirmSelection}
          disabled={!selectedProject}
          onMouseEnter={(e) => {
            if (selectedProject) {
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