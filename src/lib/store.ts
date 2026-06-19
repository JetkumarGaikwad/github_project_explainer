import { create } from 'zustand'

export interface TechStackItem {
  name: string
  category: string
  description: string
}

export interface DirectoryItem {
  name: string
  type: 'file' | 'directory'
  description: string
  path: string
}

export interface MainFunction {
  name: string
  file: string
  description: string
  lineNumber?: number
}

export interface Improvement {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  category: string
}

export interface ProjectAnalysis {
  id: string
  githubUrl: string
  repoName: string
  repoDescription: string | null
  techStack: TechStackItem[]
  directoryStructure: DirectoryItem[]
  mainFunctions: MainFunction[]
  explanation: string
  improvements: Improvement[]
  createdAt: string
}

export interface QuizQuestion {
  id: number
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
}

export interface QuizAnswer {
  questionIndex: number
  question: string
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  explanation: string
}

export interface QuizSession {
  id: string
  projectAnalysisId: string
  questions: QuizQuestion[]
  currentQuestion: number
  answers: QuizAnswer[]
  score: number
  status: 'in_progress' | 'completed'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface VivaQuestion {
  id: number
  question: string
  category: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  keyPoints: string[]
  idealAnswer: string
}

export interface VivaAnswer {
  questionId: number
  question: string
  userAnswer: string
  score: number
  feedback: string
  strengths: string[]
  improvements: string[]
  modelAnswer: string
}

export interface VivaSession {
  questions: VivaQuestion[]
  currentQuestion: number
  answers: VivaAnswer[]
  totalScore: number
  status: 'in_progress' | 'completed'
  isVoiceMode?: boolean
}

interface AppState {
  // Current view state
  currentView: 'home' | 'analyzing' | 'explanation' | 'quiz' | 'results' | 'viva' | 'viva-results'
  setCurrentView: (view: 'home' | 'analyzing' | 'explanation' | 'quiz' | 'results' | 'viva' | 'viva-results') => void

  // Project analysis state
  projectAnalysis: ProjectAnalysis | null
  setProjectAnalysis: (analysis: ProjectAnalysis | null) => void

  // Quiz state
  quizSession: QuizSession | null
  setQuizSession: (session: QuizSession | null) => void
  answerQuestion: (answer: string) => void
  nextQuestion: () => void

  // Chat state
  chatMessages: ChatMessage[]
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearChatMessages: () => void
  isChatLoading: boolean
  setIsChatLoading: (loading: boolean) => void

  // Viva interview state
  vivaSession: VivaSession | null
  setVivaSession: (session: VivaSession | null) => void
  addVivaAnswer: (answer: VivaAnswer) => void
  nextVivaQuestion: () => void

  // Loading states
  isAnalyzing: boolean
  setIsAnalyzing: (loading: boolean) => void
  isGeneratingQuiz: boolean
  setIsGeneratingQuiz: (loading: boolean) => void
  isGeneratingViva: boolean
  setIsGeneratingViva: (loading: boolean) => void
  isEvaluatingAnswer: boolean
  setIsEvaluatingAnswer: (loading: boolean) => void

  // Error state
  error: string | null
  setError: (error: string | null) => void

  // Reset
  reset: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Current view state
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  // Project analysis state
  projectAnalysis: null,
  setProjectAnalysis: (analysis) => set({ projectAnalysis: analysis }),

  // Quiz state
  quizSession: null,
  setQuizSession: (session) => set({ quizSession: session }),
  answerQuestion: (answer) => {
    const session = get().quizSession
    if (!session) return

    const currentQ = session.questions[session.currentQuestion]
    const isCorrect = currentQ.options.indexOf(answer) === currentQ.correctAnswer

    const newAnswer: QuizAnswer = {
      questionIndex: session.currentQuestion,
      question: currentQ.question,
      userAnswer: answer,
      correctAnswer: currentQ.options[currentQ.correctAnswer],
      isCorrect,
      explanation: currentQ.explanation
    }

    set({
      quizSession: {
        ...session,
        answers: [...session.answers, newAnswer],
        score: isCorrect ? session.score + 1 : session.score
      }
    })
  },
  nextQuestion: () => {
    const session = get().quizSession
    if (!session) return

    const nextIndex = session.currentQuestion + 1
    if (nextIndex >= session.questions.length) {
      set({
        quizSession: { ...session, status: 'completed', currentQuestion: nextIndex },
        currentView: 'results'
      })
    } else {
      set({ quizSession: { ...session, currentQuestion: nextIndex } })
    }
  },

  // Chat state
  chatMessages: [],
  addChatMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    }
    set({ chatMessages: [...get().chatMessages, newMessage] })
  },
  clearChatMessages: () => set({ chatMessages: [] }),
  isChatLoading: false,
  setIsChatLoading: (loading) => set({ isChatLoading: loading }),

  // Viva interview state
  vivaSession: null,
  setVivaSession: (session) => set({ vivaSession: session }),
  addVivaAnswer: (answer) => {
    const session = get().vivaSession
    if (!session) return

    const newTotalScore = session.totalScore + answer.score
    const newAnswers = [...session.answers, answer]

    set({
      vivaSession: {
        ...session,
        answers: newAnswers,
        totalScore: newTotalScore
      }
    })
  },
  nextVivaQuestion: () => {
    const session = get().vivaSession
    if (!session) return

    const nextIndex = session.currentQuestion + 1
    if (nextIndex >= session.questions.length) {
      set({
        vivaSession: { ...session, status: 'completed', currentQuestion: nextIndex },
        currentView: 'viva-results'
      })
    } else {
      set({ vivaSession: { ...session, currentQuestion: nextIndex } })
    }
  },

  // Loading states
  isAnalyzing: false,
  setIsAnalyzing: (loading) => set({ isAnalyzing: loading }),
  isGeneratingQuiz: false,
  setIsGeneratingQuiz: (loading) => set({ isGeneratingQuiz: loading }),
  isGeneratingViva: false,
  setIsGeneratingViva: (loading) => set({ isGeneratingViva: loading }),
  isEvaluatingAnswer: false,
  setIsEvaluatingAnswer: (loading) => set({ isEvaluatingAnswer: loading }),

  // Error state
  error: null,
  setError: (error) => set({ error }),

  // Reset
  reset: () => set({
    currentView: 'home',
    projectAnalysis: null,
    quizSession: null,
    chatMessages: [],
    isChatLoading: false,
    vivaSession: null,
    isAnalyzing: false,
    isGeneratingQuiz: false,
    isGeneratingViva: false,
    isEvaluatingAnswer: false,
    error: null
  })
}))
