import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API key not set");
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await res.json();
    
    // Filter models that support generateContent
    const validModels = (data.models || []).filter((m: any) => 
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
    );
    
    return NextResponse.json(validModels);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
