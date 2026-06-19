import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

interface QuizQuestion {
  id: number
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
}

async function generateQuizQuestions(
  projectAnalysis: {
    repoName: string
    repoDescription: string | null
    techStack: Array<{ name: string; category: string; description: string }>
    directoryStructure: Array<{ name: string; type: string; description: string; path: string }>
    mainFunctions: Array<{ name: string; file: string; description: string }>
    explanation: string
    improvements: Array<{ title: string; description: string; priority: string; category: string }>
  }
): Promise<QuizQuestion[]> {
  const zai = await ZAI.create()

  const prompt = `You are an expert technical interviewer. Based on this GitHub project analysis, generate 15 interview questions that test a student's understanding of the project.

Project Information:
- Name: ${projectAnalysis.repoName}
- Description: ${projectAnalysis.repoDescription || 'No description'}

Tech Stack:
${projectAnalysis.techStack.map(t => `- ${t.name} (${t.category}): ${t.description}`).join('\n')}

Directory Structure:
${projectAnalysis.directoryStructure.map(d => `- ${d.path}: ${d.description}`).join('\n')}

Key Functions/Components:
${projectAnalysis.mainFunctions.map(f => `- ${f.name} in ${f.file}: ${f.description}`).join('\n')}

Project Explanation:
${projectAnalysis.explanation}

Improvement Areas:
${projectAnalysis.improvements.map(i => `- ${i.title}: ${i.description}`).join('\n')}

Generate exactly 15 questions with this distribution:
- 5 BASIC questions (simple understanding, terminology, basic concepts)
- 5 INTERMEDIATE questions (how things work, relationships between components)
- 5 ADVANCED questions (deep understanding, optimization, trade-offs, improvements)

Return a JSON array (NO markdown, just pure JSON):
[
  {
    "id": 1,
    "question": "What is the main purpose of this project?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Explanation of why this answer is correct...",
    "difficulty": "basic"
  }
]

Rules:
1. Each question must have exactly 4 options
2. correctAnswer is the index (0-3) of the correct option
3. Make questions progressively harder
4. Questions should test actual understanding, not just memorization
5. Include practical questions about how to modify or extend the project
6. Ask about the tech stack choices and their benefits
7. Include questions about the project structure and architecture`

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: 'You are an expert technical interviewer who creates challenging but fair quiz questions. Always respond with valid JSON array only, no markdown formatting.'
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
    // Try to extract JSON from the response
    let jsonStr = response.trim()
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const questions: QuizQuestion[] = JSON.parse(jsonStr)
    
    // Validate and ensure we have 15 questions
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions format')
    }

    // Ensure each question has proper structure
    return questions.slice(0, 15).map((q, index) => ({
      id: index + 1,
      question: q.question || `Question ${index + 1}`,
      options: Array.isArray(q.options) && q.options.length === 4 
        ? q.options 
        : ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
      explanation: q.explanation || 'No explanation provided.',
      difficulty: q.difficulty || (index < 5 ? 'basic' : index < 10 ? 'intermediate' : 'advanced')
    }))
  } catch {
    // Generate fallback questions
    return generateFallbackQuestions(projectAnalysis)
  }
}

function generateFallbackQuestions(
  projectAnalysis: {
    repoName: string
    repoDescription: string | null
    techStack: Array<{ name: string; category: string; description: string }>
    explanation: string
  }
): QuizQuestion[] {
  const techNames = projectAnalysis.techStack.map(t => t.name)
  const mainTech = techNames[0] || 'the technology'

  const basicQuestions: QuizQuestion[] = [
    {
      id: 1,
      question: `What is the primary purpose of the ${projectAnalysis.repoName} project?`,
      options: [
        projectAnalysis.repoDescription?.slice(0, 50) || 'A software development project',
        'A gaming application',
        'A social media platform',
        'An e-commerce website'
      ],
      correctAnswer: 0,
      explanation: `The project is described as: ${projectAnalysis.repoDescription || 'A software development project'}`,
      difficulty: 'basic'
    },
    {
      id: 2,
      question: `What is the main technology used in this project?`,
      options: [
        mainTech,
        'Python',
        'Ruby',
        'PHP'
      ],
      correctAnswer: 0,
      explanation: `The primary technology stack includes ${mainTech}.`,
      difficulty: 'basic'
    },
    {
      id: 3,
      question: 'How many technologies are used in this project?',
      options: [
        techNames.length.toString(),
        '1',
        '2',
        '10'
      ],
      correctAnswer: 0,
      explanation: `The project uses ${techNames.length} different technologies in its stack.`,
      difficulty: 'basic'
    },
    {
      id: 4,
      question: 'What type of project is this based on its structure?',
      options: [
        'A full-stack application',
        'A simple script',
        'A static website',
        'A mobile application'
      ],
      correctAnswer: 0,
      explanation: 'Based on the directory structure and tech stack, this is a full-stack application.',
      difficulty: 'basic'
    },
    {
      id: 5,
      question: 'Which category does the main technology belong to?',
      options: [
        projectAnalysis.techStack[0]?.category || 'Framework',
        'Database',
        'Testing',
        'Deployment'
      ],
      correctAnswer: 0,
      explanation: `${mainTech} is categorized as ${projectAnalysis.techStack[0]?.category || 'a framework'}.`,
      difficulty: 'basic'
    }
  ]

  const intermediateQuestions: QuizQuestion[] = [
    {
      id: 6,
      question: 'How does the project structure support maintainability?',
      options: [
        'By organizing code into separate modules and components',
        'By keeping all code in one file',
        'By avoiding any folder structure',
        'By using only external libraries'
      ],
      correctAnswer: 0,
      explanation: 'A well-organized directory structure with separate modules improves code maintainability and reusability.',
      difficulty: 'intermediate'
    },
    {
      id: 7,
      question: `Why would ${mainTech} be chosen for this project?`,
      options: [
        'For its performance and ecosystem support',
        'Because it is the only option available',
        'To make the project more complex',
        'Without any specific reason'
      ],
      correctAnswer: 0,
      explanation: `${mainTech} provides good performance, a rich ecosystem, and developer productivity benefits.`,
      difficulty: 'intermediate'
    },
    {
      id: 8,
      question: 'What is the purpose of separating components into different files?',
      options: [
        'To improve code organization and reusability',
        'To make the project larger',
        'To confuse other developers',
        'To slow down the build process'
      ],
      correctAnswer: 0,
      explanation: 'Component separation enables better code organization, easier testing, and improved reusability.',
      difficulty: 'intermediate'
    },
    {
      id: 9,
      question: 'How do the technologies in this project work together?',
      options: [
        'Each technology handles a specific concern in the application',
        'They all do the same thing',
        'Only one technology is actually used',
        'They are randomly selected'
      ],
      correctAnswer: 0,
      explanation: 'Different technologies handle different concerns: frontend, backend, database, etc.',
      difficulty: 'intermediate'
    },
    {
      id: 10,
      question: 'What would be a good next feature to add to this project?',
      options: [
        'User authentication if not present',
        'More console.log statements',
        'Duplicate functionality',
        'Remove existing tests'
      ],
      correctAnswer: 0,
      explanation: 'Adding user authentication is often a valuable feature for many applications.',
      difficulty: 'intermediate'
    }
  ]

  const advancedQuestions: QuizQuestion[] = [
    {
      id: 11,
      question: 'How would you optimize the performance of this application?',
      options: [
        'Implement caching, code splitting, and lazy loading',
        'Add more dependencies',
        'Remove all comments',
        'Use only one file for all code'
      ],
      correctAnswer: 0,
      explanation: 'Performance optimization strategies include caching, code splitting, lazy loading, and bundle optimization.',
      difficulty: 'advanced'
    },
    {
      id: 12,
      question: 'What architectural patterns would improve this codebase?',
      options: [
        'Repository pattern, dependency injection, and clean architecture',
        'Copy-paste pattern',
        'Spaghetti code pattern',
        'No architectural patterns needed'
      ],
      correctAnswer: 0,
      explanation: 'Architectural patterns like repository pattern and dependency injection improve testability and maintainability.',
      difficulty: 'advanced'
    },
    {
      id: 13,
      question: 'How would you scale this application for millions of users?',
      options: [
        'Implement horizontal scaling, caching layers, and database optimization',
        'Just add more RAM to one server',
        'Use only client-side processing',
        'Remove database entirely'
      ],
      correctAnswer: 0,
      explanation: 'Scaling strategies include horizontal scaling, caching, database sharding, and CDN usage.',
      difficulty: 'advanced'
    },
    {
      id: 14,
      question: 'What security considerations should be addressed in this project?',
      options: [
        'Input validation, authentication, authorization, and data encryption',
        'No security is needed for this project',
        'Only frontend security matters',
        'Security slows down the application'
      ],
      correctAnswer: 0,
      explanation: 'Security best practices include input validation, proper authentication, authorization checks, and data encryption.',
      difficulty: 'advanced'
    },
    {
      id: 15,
      question: 'How would you improve the developer experience for contributors?',
      options: [
        'Add comprehensive documentation, contribution guidelines, and development setup scripts',
        'Remove all documentation',
        'Make the code harder to understand',
        'Delete the README file'
      ],
      correctAnswer: 0,
      explanation: 'Good documentation, clear contribution guidelines, and easy setup scripts improve the developer experience.',
      difficulty: 'advanced'
    }
  ]

  return [...basicQuestions, ...intermediateQuestions, ...advancedQuestions]
}

export async function POST(request: NextRequest) {
  try {
    const { projectAnalysisId } = await request.json()

    if (!projectAnalysisId) {
      return NextResponse.json({ error: 'Project analysis ID is required' }, { status: 400 })
    }

    // Fetch the project analysis
    const projectAnalysis = await db.projectAnalysis.findUnique({
      where: { id: projectAnalysisId }
    })

    if (!projectAnalysis) {
      return NextResponse.json({ error: 'Project analysis not found' }, { status: 404 })
    }

    // Parse the stored data
    const analysisData = {
      repoName: projectAnalysis.repoName,
      repoDescription: projectAnalysis.repoDescription,
      techStack: JSON.parse(projectAnalysis.techStack),
      directoryStructure: JSON.parse(projectAnalysis.directoryStructure),
      mainFunctions: JSON.parse(projectAnalysis.mainFunctions),
      explanation: projectAnalysis.explanation,
      improvements: JSON.parse(projectAnalysis.improvements)
    }

    // Generate quiz questions
    const questions = await generateQuizQuestions(analysisData)

    // Create quiz session
    const quizSession = await db.quizSession.create({
      data: {
        projectAnalysisId: projectAnalysis.id,
        questions: JSON.stringify(questions),
        currentQuestion: 0,
        score: 0,
        totalQuestions: questions.length,
        status: 'in_progress'
      }
    })

    return NextResponse.json({
      session: {
        id: quizSession.id,
        projectAnalysisId: quizSession.projectAnalysisId,
        questions,
        currentQuestion: 0,
        answers: [],
        score: 0,
        status: 'in_progress'
      }
    })
  } catch (error) {
    console.error('Quiz generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate quiz' },
      { status: 500 }
    )
  }
}
