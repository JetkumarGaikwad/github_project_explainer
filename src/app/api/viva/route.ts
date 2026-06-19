import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

interface VivaQuestion {
  id: number
  question: string
  category: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  keyPoints: string[]
  idealAnswer: string
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

async function generateVivaQuestions(context: ProjectContext): Promise<VivaQuestion[]> {
  const zai = await ZAI.create()

  const prompt = `You are an expert technical interviewer. Generate 10 viva/oral interview questions for this GitHub project. These should be questions that require detailed verbal explanations, not multiple choice.

Project: ${context.repoName}
Description: ${context.repoDescription || 'No description'}
Tech Stack: ${context.techStack.map(t => t.name).join(', ')}
Primary Language: ${context.techStack.find(t => t.category.toLowerCase().includes('language'))?.name || 'Unknown'}

Key Functions:
${context.mainFunctions.map(f => `- ${f.name}: ${f.description}`).join('\n')}

Project Explanation:
${context.explanation}

Generate exactly 10 questions that an interviewer would ask in a viva/oral exam. The questions should:
1. Test understanding of the project architecture and design decisions
2. Ask about data handling, preprocessing, and features
3. Probe knowledge of algorithms, models, and implementation details
4. Challenge the candidate to explain trade-offs and alternatives
5. Include follow-up questions that dig deeper

Return a JSON array with this structure (NO markdown, just pure JSON):
[
  {
    "id": 1,
    "question": "Explain the overall architecture of this project and how the different components work together.",
    "category": "Architecture",
    "difficulty": "basic",
    "keyPoints": ["point1", "point2", "point3"],
    "idealAnswer": "A comprehensive answer that covers..."
  }
]

Distribution: 3 basic, 4 intermediate, 3 advanced questions.

Categories to cover:
- Project Overview & Architecture (2 questions)
- Data & Preprocessing (2 questions) 
- Algorithms/Models & Implementation (3 questions)
- Testing & Evaluation (1 question)
- Deployment & Scalability (1 question)
- Challenges & Improvements (1 question)

Make questions realistic and challenging. The keyPoints should be 3-5 main points that a good answer should cover. The idealAnswer should be detailed and comprehensive.`

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: 'You are an expert technical interviewer who creates challenging viva/oral exam questions. Always respond with valid JSON array only, no markdown formatting.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    thinking: { type: 'disabled' }
  })

  const response = completion.choices[0]?.message?.content || '[]'

  try {
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const questions: VivaQuestion[] = JSON.parse(jsonStr)
    return questions.map((q, index) => ({
      id: index + 1,
      question: q.question || `Question ${index + 1}`,
      category: q.category || 'General',
      difficulty: q.difficulty || (index < 3 ? 'basic' : index < 7 ? 'intermediate' : 'advanced'),
      keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : [],
      idealAnswer: q.idealAnswer || 'No ideal answer provided.'
    }))
  } catch {
    // Return default questions if parsing fails
    return getDefaultQuestions(context)
  }
}

function getDefaultQuestions(context: ProjectContext): VivaQuestion[] {
  const techName = context.techStack[0]?.name || 'the technology'
  
  return [
    {
      id: 1,
      question: `Can you give me a brief overview of your ${context.repoName} project? What problem does it solve?`,
      category: 'Project Overview',
      difficulty: 'basic',
      keyPoints: ['Problem statement', 'Solution approach', 'Key features', 'Target users'],
      idealAnswer: `The ${context.repoName} project is designed to ${context.repoDescription || 'solve a specific problem'}. It uses ${techName} as the primary technology.`
    },
    {
      id: 2,
      question: 'Walk me through the architecture of your project. What are the main components and how do they interact?',
      category: 'Architecture',
      difficulty: 'basic',
      keyPoints: ['Main components', 'Data flow', 'Module interactions', 'Design patterns used'],
      idealAnswer: 'A good answer would describe the main modules, how data flows between them, and the overall system design.'
    },
    {
      id: 3,
      question: `Tell me about the data you used in this project. What is the source, size, and format of your data?`,
      category: 'Data',
      difficulty: 'basic',
      keyPoints: ['Data source', 'Data size', 'Data format', 'Data features'],
      idealAnswer: 'The answer should cover where the data comes from, its volume, structure, and key characteristics.'
    },
    {
      id: 4,
      question: 'What preprocessing steps did you apply to your data? Why were these necessary?',
      category: 'Data Preprocessing',
      difficulty: 'intermediate',
      keyPoints: ['Cleaning steps', 'Normalization/scaling', 'Feature engineering', 'Handling missing data'],
      idealAnswer: 'A comprehensive answer would discuss all preprocessing steps and justify each one.'
    },
    {
      id: 5,
      question: 'Explain the algorithm or model you chose for this project. Why did you choose it over alternatives?',
      category: 'Algorithm/Model',
      difficulty: 'intermediate',
      keyPoints: ['Algorithm description', 'Pros and cons', 'Alternative approaches', 'Justification for choice'],
      idealAnswer: 'The answer should demonstrate understanding of the algorithm and ability to compare with alternatives.'
    },
    {
      id: 6,
      question: 'What were the biggest challenges you faced while building this project? How did you overcome them?',
      category: 'Challenges',
      difficulty: 'intermediate',
      keyPoints: ['Technical challenges', 'Solutions implemented', 'Lessons learned', 'Problem-solving approach'],
      idealAnswer: 'A good answer shows problem-solving skills and ability to learn from challenges.'
    },
    {
      id: 7,
      question: 'How did you evaluate your model/project? What metrics did you use and why?',
      category: 'Evaluation',
      difficulty: 'intermediate',
      keyPoints: ['Evaluation metrics', 'Why these metrics', 'Baseline comparison', 'Results interpretation'],
      idealAnswer: 'The answer should show understanding of evaluation methodologies and metric selection.'
    },
    {
      id: 8,
      question: 'If you had more time or resources, how would you improve this project?',
      category: 'Improvements',
      difficulty: 'advanced',
      keyPoints: ['Specific improvements', 'Technical feasibility', 'Expected impact', 'Priority ranking'],
      idealAnswer: 'A thoughtful answer showing vision and understanding of the project\'s limitations.'
    },
    {
      id: 9,
      question: 'How would you scale this solution to handle 10x or 100x more data/users?',
      category: 'Scalability',
      difficulty: 'advanced',
      keyPoints: ['Bottlenecks', 'Scaling strategies', 'Architecture changes', 'Cost considerations'],
      idealAnswer: 'The answer should demonstrate understanding of distributed systems and scalability patterns.'
    },
    {
      id: 10,
      question: 'What would you do differently if you were to rebuild this project from scratch?',
      category: 'Reflection',
      difficulty: 'advanced',
      keyPoints: ['Design changes', 'Technology choices', 'Process improvements', 'Key learnings'],
      idealAnswer: 'A reflective answer showing growth and learning from the project experience.'
    }
  ]
}

async function evaluateAnswer(
  context: ProjectContext,
  question: VivaQuestion,
  userAnswer: string
): Promise<{
  score: number
  feedback: string
  strengths: string[]
  improvements: string[]
  modelAnswer: string
}> {
  const zai = await ZAI.create()

  const prompt = `You are an expert technical interviewer evaluating a candidate's answer in a viva/oral exam.

Project: ${context.repoName}
Tech Stack: ${context.techStack.map(t => t.name).join(', ')}

Question: ${question.question}
Difficulty: ${question.difficulty}
Category: ${question.category}

Key Points Expected in Answer:
${question.keyPoints.map(p => `- ${p}`).join('\n')}

Ideal Answer:
${question.idealAnswer}

Candidate's Answer:
${userAnswer}

Evaluate this answer and return a JSON object with this structure (NO markdown, just pure JSON):
{
  "score": <number 0-100>,
  "feedback": "Overall feedback on the answer...",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "modelAnswer": "A concise model answer that the candidate can learn from"
}

Scoring Guide:
- 90-100: Excellent - Covered all key points with depth and clarity
- 75-89: Good - Covered most key points with some depth
- 60-74: Satisfactory - Covered some key points but lacked depth
- 40-59: Needs Improvement - Missed many key points
- 0-39: Poor - Significantly incorrect or incomplete

Be constructive and encouraging in your feedback. The modelAnswer should be concise but comprehensive.`

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: 'You are a supportive technical interviewer who provides constructive feedback. Always respond with valid JSON only, no markdown formatting.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    thinking: { type: 'disabled' }
  })

  const response = completion.choices[0]?.message?.content || '{}'

  try {
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const result = JSON.parse(jsonStr)
    return {
      score: typeof result.score === 'number' ? result.score : 50,
      feedback: result.feedback || 'Unable to evaluate answer.',
      strengths: Array.isArray(result.strengths) ? result.strengths : [],
      improvements: Array.isArray(result.improvements) ? result.improvements : [],
      modelAnswer: result.modelAnswer || question.idealAnswer
    }
  } catch {
    return {
      score: 50,
      feedback: 'Unable to evaluate answer properly. Please try again.',
      strengths: [],
      improvements: ['Try to provide more specific details in your answer.'],
      modelAnswer: question.idealAnswer
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, projectAnalysisId, question, userAnswer, questions } = body

    // Get project context
    const context = await getProjectContext(projectAnalysisId)
    if (!context) {
      return NextResponse.json({ error: 'Project analysis not found' }, { status: 404 })
    }

    if (action === 'generate') {
      // Generate viva questions
      const vivaQuestions = await generateVivaQuestions(context)
      return NextResponse.json({
        success: true,
        questions: vivaQuestions
      })
    }

    if (action === 'evaluate') {
      // Evaluate user answer
      if (!question || !userAnswer) {
        return NextResponse.json({ error: 'Question and answer are required' }, { status: 400 })
      }

      const evaluation = await evaluateAnswer(context, question, userAnswer)
      return NextResponse.json({
        success: true,
        evaluation
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Viva API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    )
  }
}
