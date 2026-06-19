import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ProjectContext {
  repoName: string
  repoDescription: string | null
  githubUrl: string
  techStack: Array<{ name: string; category: string; description: string }>
  directoryStructure: Array<{ name: string; type: string; description: string; path: string }>
  mainFunctions: Array<{ name: string; file: string; description: string }>
  explanation: string
  improvements: Array<{ title: string; description: string; priority: string; category: string }>
}

async function getProjectContext(projectAnalysisId: string): Promise<ProjectContext | null> {
  const analysis = await db.projectAnalysis.findUnique({
    where: { id: projectAnalysisId }
  })

  if (!analysis) return null

  return {
    repoName: analysis.repoName,
    repoDescription: analysis.repoDescription,
    githubUrl: analysis.githubUrl,
    techStack: JSON.parse(analysis.techStack),
    directoryStructure: JSON.parse(analysis.directoryStructure),
    mainFunctions: JSON.parse(analysis.mainFunctions),
    explanation: analysis.explanation,
    improvements: JSON.parse(analysis.improvements)
  }
}

function buildRAGContext(context: ProjectContext): string {
  return `
# Project: ${context.repoName}

## Description
${context.repoDescription || 'No description available'}

## GitHub URL
${context.githubUrl}

## Tech Stack
${context.techStack.map(t => `- **${t.name}** (${t.category}): ${t.description}`).join('\n')}

## Directory Structure
${context.directoryStructure.map(d => `- ${d.type === 'directory' ? '📁' : '📄'} **${d.path}**: ${d.description}`).join('\n')}

## Key Functions & Components
${context.mainFunctions.map(f => `- **${f.name}** (in ${f.file}): ${f.description}`).join('\n')}

## Project Explanation
${context.explanation}

## Improvement Suggestions
${context.improvements.map(i => `- **[${i.priority.toUpperCase()}] ${i.title}**: ${i.description}`).join('\n')}

---
You are an expert project assistant. Use the above context to answer questions about this project. 
Be specific, detailed, and educational. If the user asks about something not in the context, 
provide general guidance based on the project type and tech stack.
Help users prepare for interviews by explaining concepts, suggesting what interviewers might ask,
and helping them understand the project deeply.
`.trim()
}

async function chatWithAI(
  context: ProjectContext,
  conversationHistory: Message[],
  userMessage: string
): Promise<string> {
  const zai = await ZAI.create()

  // Build the RAG context
  const ragContext = buildRAGContext(context)

  // Build messages for the LLM
  const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [
    {
      role: 'assistant',
      content: `You are an expert project assistant helping a student understand a GitHub project in depth. 
Your goal is to help them prepare for interviews and truly understand the project.

You have access to detailed project information. Use this context to answer questions accurately.
When answering:
1. Be specific and reference actual files, functions, or technologies from the project
2. Explain concepts in an educational way
3. Help them understand what interviewers might ask about specific parts
4. If asked about data, models, or implementation details, provide insights based on the tech stack and project structure
5. Suggest related topics they should study or understand
6. Be encouraging and help them build confidence

${ragContext}`
    }
  ]

  // Add conversation history (last 10 messages for context)
  const recentHistory = conversationHistory.slice(-10)
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content
    })
  }

  // Add the current user message
  messages.push({
    role: 'user',
    content: userMessage
  })

  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' }
  })

  return completion.choices[0]?.message?.content || 'I apologize, I could not generate a response. Please try again.'
}

export async function POST(request: NextRequest) {
  try {
    const { projectAnalysisId, message, history } = await request.json()

    if (!projectAnalysisId || !message) {
      return NextResponse.json({ error: 'Project ID and message are required' }, { status: 400 })
    }

    // Get project context for RAG
    const context = await getProjectContext(projectAnalysisId)
    if (!context) {
      return NextResponse.json({ error: 'Project analysis not found' }, { status: 404 })
    }

    // Get AI response with RAG context
    const response = await chatWithAI(context, history || [], message)

    return NextResponse.json({
      success: true,
      message: response
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat message' },
      { status: 500 }
    )
  }
}
