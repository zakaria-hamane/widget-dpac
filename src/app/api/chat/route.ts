import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('🔵 Request received:', body);
    
    // Transformer le format pour l'API backend avec la structure complète
    const backendPayload = {
      input: {
        client_id: body.client_id || "dpac",
        domain_id: body.domain_id || "dpac",
        input_text: body.question || body.input_text,  // La question de l'utilisateur
        language: body.language || "it",               // Langue par défaut: italien
        project_id: body.project_id || "dpac_portal",
        session_id: body.session_id || `session_${Date.now()}`,
        user_id: body.user_id || "guest_user",
        top_k: body.top_k || 5,
        limit: body.limit || 10,
        workflow_id: body.workflow_id || "vector_inference_001",
        out_of_context_detection: body.out_of_context_detection ?? true,
        detect_sensitive_topics: body.detect_sensitive_topics ?? true,
        // Optionnel: inclure les fichiers si fournis
        ...(body.files && body.files.length > 0 && { files: body.files })
      }
    };
    
    console.log('📤 Sending to backend:', backendPayload);
    
    // Appel à l'API backend
    const backendUrl = process.env.BACKEND_API_URL || 'http://72.146.12.109:8002';
    console.log('🌐 Backend URL:', backendUrl);
    
    const response = await fetch(`${backendUrl}/api/chat/vector_inference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendPayload),
    });

    console.log('🟢 Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend API error', status: response.status, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('✅ Backend response data:', data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy API error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend API' },
      { status: 500 }
    );
  }
}

