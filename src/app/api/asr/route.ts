import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { audioBase64 } = body

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return NextResponse.json({ error: 'Audio base64 data is required' }, { status: 400 })
    }

    const zai = await ZAI.create()

    const response = await zai.audio.asr.create({
      file_base64: audioBase64
    })

    return NextResponse.json({
      success: true,
      transcription: response.text || ''
    })
  } catch (error) {
    console.error('ASR API Error:', error)

    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to transcribe audio' 
      },
      { status: 500 }
    )
  }
}
