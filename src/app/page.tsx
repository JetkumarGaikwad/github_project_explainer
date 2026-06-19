'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Github, 
  BookOpen, 
  Brain, 
  Trophy, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  FolderTree,
  Code2,
  Lightbulb,
  GraduationCap,
  RotateCcw,
  ExternalLink,
  MessageCircle,
  Send,
  User,
  Bot,
  Mic,
  MicOff,
  Volume2,
  Square
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useAppStore, type ProjectAnalysis, type QuizQuestion } from '@/lib/store'
import { toast } from 'sonner'

export default function Home() {
  const {
    currentView,
    setCurrentView,
    projectAnalysis,
    setProjectAnalysis,
    quizSession,
    setQuizSession,
    answerQuestion,
    nextQuestion,
    isAnalyzing,
    setIsAnalyzing,
    isGeneratingQuiz,
    setIsGeneratingQuiz,
    error,
    setError,
    reset,
    chatMessages,
    addChatMessage,
    isChatLoading,
    setIsChatLoading,
    vivaSession,
    setVivaSession,
    addVivaAnswer,
    nextVivaQuestion,
    isGeneratingViva,
    setIsGeneratingViva,
    isEvaluatingAnswer,
    setIsEvaluatingAnswer
  } = useAppStore()

  const [githubUrl, setGithubUrl] = useState('')
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [vivaAnswer, setVivaAnswer] = useState('')
  const [showVivaFeedback, setShowVivaFeedback] = useState(false)

  // Voice interview states
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  // Sample projects for quick testing
  const sampleProjects = [
    { name: 'Next.js', url: 'https://github.com/vercel/next.js', description: 'The React Framework' },
    { name: 'React', url: 'https://github.com/facebook/react', description: 'A JavaScript library for building UIs' },
    { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', description: 'A utility-first CSS framework' },
    { name: 'VS Code', url: 'https://github.com/microsoft/vscode', description: 'Visual Studio Code editor' },
  ]

  const handleAnalyze = async () => {
    if (!githubUrl.trim()) {
      toast.error('Please enter a GitHub URL')
      return
    }

    const githubPattern = /^https?:\/\/github\.com\/[^/]+\/[^/]+/
    if (!githubPattern.test(githubUrl.trim())) {
      toast.error('Please enter a valid GitHub repository URL')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setCurrentView('analyzing')

    // Retry logic - try up to 5 times with exponential backoff
    const maxRetries = 5
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Starting analysis for: ${githubUrl} (attempt ${attempt}/${maxRetries})`)
        
        // Use AbortController with extended timeout (3 minutes)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minutes timeout
        
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ githubUrl: githubUrl.trim() }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        console.log('Response status:', response.status)

        // Check if response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text()
          console.error('Non-JSON response:', text.substring(0, 200))
          
          // Check for gateway errors (502, 504)
          const isGatewayError = text.includes('502') || text.includes('504') || text.includes('Bad Gateway') || text.includes('Gateway Timeout')
          
          if (attempt < maxRetries) {
            const waitTime = Math.min(3000 * attempt, 10000) // Exponential backoff, max 10s
            const errorMsg = isGatewayError 
              ? `Gateway timeout. Retrying in ${waitTime/1000}s... (${attempt}/${maxRetries})`
              : `Request timed out. Retrying... (${attempt}/${maxRetries})`
            toast.warning(errorMsg)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }
          throw new Error('The server is taking too long to respond. Please try again in a moment - the analysis typically takes 30-60 seconds.')
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: 'Unknown error' }))
          console.error('API error:', data)
          throw new Error(data.error || 'Failed to analyze repository')
        }

        const data = await response.json()
        console.log('Analysis result:', data)
        
        if (!data.analysis) {
          throw new Error('No analysis data received')
        }
        
        // Validate required fields
        const analysis = data.analysis
        if (!analysis.techStack || !analysis.directoryStructure || !analysis.explanation) {
          throw new Error('Incomplete analysis data received')
        }
        
        setProjectAnalysis(analysis)
        setCurrentView('explanation')
        toast.success('Repository analyzed successfully!')
        return // Success - exit the retry loop
        
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('An error occurred')
        console.error(`Analysis error (attempt ${attempt}):`, err)
        
        // Don't retry on abort (user cancelled)
        if (err instanceof Error && err.name === 'AbortError') {
          break
        }
        
        // Wait before retrying with exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.min(2000 * attempt, 8000)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }

    // All retries failed
    const errorMessage = lastError?.name === 'AbortError' 
      ? 'Request timed out after 3 minutes. Please try again.' 
      : (lastError?.message || 'An error occurred. Please try again.')
    setError(errorMessage)
    setCurrentView('home')
    toast.error(errorMessage)
    setIsAnalyzing(false)
  }

  const handleStartQuiz = async () => {
    if (!projectAnalysis) return

    setIsGeneratingQuiz(true)
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectAnalysisId: projectAnalysis.id })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate quiz')
      }

      const data = await response.json()
      setQuizSession(data.session)
      setCurrentView('quiz')
      toast.success('Quiz generated! Good luck!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate quiz')
    } finally {
      setIsGeneratingQuiz(false)
    }
  }

  const handleAnswerSubmit = () => {
    if (!selectedAnswer || !quizSession) return
    answerQuestion(selectedAnswer)
    setSelectedAnswer(null)
    setTimeout(() => {
      nextQuestion()
    }, 1000)
  }

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !projectAnalysis || isChatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    
    // Add user message
    addChatMessage({ role: 'user', content: userMessage })
    setIsChatLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectAnalysisId: projectAnalysis.id,
          message: userMessage,
          history: chatMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      addChatMessage({ role: 'assistant', content: data.message })
    } catch (err) {
      toast.error('Failed to get response. Please try again.')
      addChatMessage({ role: 'assistant', content: 'Sorry, I encountered an error. Please try asking your question again.' })
    } finally {
      setIsChatLoading(false)
    }
  }

  // Viva Interview Handlers
  const handleStartViva = async () => {
    if (!projectAnalysis) return

    setIsGeneratingViva(true)
    try {
      const response = await fetch('/api/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          projectAnalysisId: projectAnalysis.id
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate viva questions')
      }

      const data = await response.json()
      setVivaSession({
        questions: data.questions,
        currentQuestion: 0,
        answers: [],
        totalScore: 0,
        status: 'in_progress'
      })
      setCurrentView('viva')
      toast.success('Viva interview started! Answer the questions verbally.')
    } catch (err) {
      toast.error('Failed to start viva interview')
    } finally {
      setIsGeneratingViva(false)
    }
  }

  const handleVivaSubmit = async () => {
    if (!vivaAnswer.trim() || !vivaSession) return

    const currentQ = vivaSession.questions[vivaSession.currentQuestion]
    setIsEvaluatingAnswer(true)

    try {
      const response = await fetch('/api/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          projectAnalysisId: projectAnalysis?.id,
          question: currentQ,
          userAnswer: vivaAnswer.trim()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to evaluate answer')
      }

      const data = await response.json()
      addVivaAnswer({
        questionId: currentQ.id,
        question: currentQ.question,
        userAnswer: vivaAnswer.trim(),
        score: data.evaluation.score,
        feedback: data.evaluation.feedback,
        strengths: data.evaluation.strengths,
        improvements: data.evaluation.improvements,
        modelAnswer: data.evaluation.modelAnswer
      })
      setShowVivaFeedback(true)
    } catch (err) {
      toast.error('Failed to evaluate answer')
    } finally {
      setIsEvaluatingAnswer(false)
    }
  }

  const handleNextVivaQuestion = () => {
    setVivaAnswer('')
    setShowVivaFeedback(false)
    setAudioUrl(null)
    nextVivaQuestion()
  }

  // Voice Interview Functions
  const speakQuestion = async (text: string) => {
    if (isSpeaking) return
    
    try {
      setIsSpeaking(true)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'tongtong', speed: 0.9 })
      })

      if (!response.ok) {
        throw new Error('Failed to generate speech')
      }

      const audioBlob = await response.blob()
      const audio = new Audio(URL.createObjectURL(audioBlob))
      
      audio.onended = () => {
        setIsSpeaking(false)
      }

      audio.onerror = () => {
        setIsSpeaking(false)
        toast.error('Failed to play audio')
      }

      await audio.play()
    } catch (err) {
      setIsSpeaking(false)
      toast.error('Failed to speak question')
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' })
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        
        // Transcribe the audio
        await transcribeAudio(audioBlob)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      toast.success('Recording started... Speak your answer')
    } catch (err) {
      toast.error('Failed to access microphone. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsTranscribing(true)
      
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      
      await new Promise<void>((resolve) => {
        reader.onloadend = () => resolve()
      })
      
      const base64Audio = (reader.result as string).split(',')[1]

      const response = await fetch('/api/asr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64Audio })
      })

      if (!response.ok) {
        throw new Error('Failed to transcribe audio')
      }

      const data = await response.json()
      
      if (data.success && data.transcription) {
        setVivaAnswer(data.transcription)
        toast.success('Transcription complete!')
      } else {
        toast.warning('Could not transcribe audio clearly. Please try again or type your answer.')
      }
    } catch (err) {
      toast.error('Failed to transcribe audio. Please type your answer instead.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const getVivaScoreMessage = () => {
    if (!vivaSession) return ''
    const avgScore = vivaSession.totalScore / vivaSession.answers.length
    if (avgScore >= 80) {
      return {
        title: 'Outstanding Performance! 🌟',
        message: 'You demonstrated excellent understanding of the project. You\'re ready to ace any interview!',
        color: 'text-green-600 dark:text-green-400'
      }
    } else if (avgScore >= 60) {
      return {
        title: 'Good Performance! 👏',
        message: 'You have a solid understanding. Review the model answers to improve further.',
        color: 'text-yellow-600 dark:text-yellow-400'
      }
    } else {
      return {
        title: 'Keep Practicing! 💪',
        message: 'Review the project explanation and model answers. Practice explaining concepts out loud.',
        color: 'text-orange-600 dark:text-orange-400'
      }
    }
  }

  const getScoreMessage = () => {
    if (!quizSession) return ''
    const percentage = (quizSession.score / quizSession.questions.length) * 100
    if (percentage >= 75) {
      return {
        title: 'Excellent! 🎉',
        message: 'You understand this project thoroughly. You can confidently explain it in interviews!',
        color: 'text-green-600 dark:text-green-400'
      }
    } else if (percentage >= 50) {
      return {
        title: 'Good Progress! 👍',
        message: 'You have gained solid knowledge about this project. A bit more review will make you interview-ready!',
        color: 'text-yellow-600 dark:text-yellow-400'
      }
    } else {
      return {
        title: 'Keep Learning! 📚',
        message: 'You need to revise the project explanation to better understand it. Try reading through the explanation again!',
        color: 'text-orange-600 dark:text-orange-400'
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Github className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">GitExplainer</h1>
              <p className="text-xs text-muted-foreground">Understand any GitHub project</p>
            </div>
          </div>
          {currentView !== 'home' && (
            <Button variant="ghost" onClick={() => reset()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Start Over
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {/* Home View */}
          {currentView === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="max-w-2xl w-full space-y-8 text-center">
                <div className="space-y-4">
                  <Badge variant="secondary" className="mb-4">AI-Powered Project Understanding</Badge>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                    Master Any{' '}
                    <span className="text-primary">GitHub Project</span>
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    Paste a GitHub repository URL and let AI explain everything - from directory structure to core functions. 
                    Then test your knowledge with a mock interview!
                  </p>
                </div>

                <Card className="p-2">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://github.com/owner/repository"
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                          className="pl-10 h-12 text-base"
                        />
                      </div>
                      <Button 
                        size="lg" 
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="h-12 px-8"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            Analyze Project
                            <ArrowRight className="h-5 w-5 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Sample Projects */}
                <div className="w-full mt-8">
                  <p className="text-sm text-muted-foreground mb-3">Or try a sample project:</p>
                  <div className="flex flex-wrap gap-2">
                    {sampleProjects.map((project) => (
                      <Button
                        key={project.url}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGithubUrl(project.url)
                          toast.info(`Selected: ${project.name}`)
                        }}
                        className="h-auto py-2 px-3"
                      >
                        <Github className="h-4 w-4 mr-2" />
                        <span className="font-medium">{project.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
                  <Card className="p-4 text-left">
                    <CardContent className="p-0 space-y-2">
                      <div className="p-2 bg-blue-500/10 rounded-lg w-fit">
                        <BookOpen className="h-5 w-5 text-blue-500" />
                      </div>
                      <h3 className="font-semibold">Project Explanation</h3>
                      <p className="text-sm text-muted-foreground">
                        Get detailed breakdown of directory structure, tech stack, and core functions
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="p-4 text-left">
                    <CardContent className="p-0 space-y-2">
                      <div className="p-2 bg-purple-500/10 rounded-lg w-fit">
                        <Lightbulb className="h-5 w-5 text-purple-500" />
                      </div>
                      <h3 className="font-semibold">Improvement Tips</h3>
                      <p className="text-sm text-muted-foreground">
                        Learn what can make the repository more fork-worthy
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="p-4 text-left">
                    <CardContent className="p-0 space-y-2">
                      <div className="p-2 bg-green-500/10 rounded-lg w-fit">
                        <Brain className="h-5 w-5 text-green-500" />
                      </div>
                      <h3 className="font-semibold">Mock Interview</h3>
                      <p className="text-sm text-muted-foreground">
                        Test your understanding with 15 questions from basic to advanced
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {/* Analyzing View */}
          {currentView === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <Card className="max-w-md w-full">
                <CardContent className="p-8 text-center space-y-4">
                  <div className="relative mx-auto w-20 h-20">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Github className="h-20 w-20 text-primary" />
                    </motion.div>
                  </div>
                  <h3 className="text-xl font-semibold">Analyzing Repository...</h3>
                  <p className="text-muted-foreground text-sm">
                    This typically takes 30-60 seconds. Please don't refresh the page.
                  </p>
                  <div className="space-y-2 text-left bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Reading repository structure...</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Identifying tech stack...</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Analyzing code patterns...</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Generating explanation...</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If you see a timeout error, the system will automatically retry up to 5 times.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Explanation View */}
          {currentView === 'explanation' && projectAnalysis && (
            <motion.div
              key="explanation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Project Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <Github className="h-6 w-6" />
                        {projectAnalysis.repoName}
                      </CardTitle>
                      <CardDescription className="text-base">
                        {projectAnalysis.repoDescription || 'No description available'}
                      </CardDescription>
                    </div>
                    <a
                      href={projectAnalysis.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </div>
                </CardHeader>
              </Card>

              {/* Tech Stack */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" />
                    Tech Stack
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {projectAnalysis.techStack.map((tech, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1">
                        <span className="font-medium">{tech.name}</span>
                        <span className="text-muted-foreground ml-1 text-xs">({tech.category})</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Directory Structure */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-primary" />
                    Directory Structure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {projectAnalysis.directoryStructure.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-muted-foreground text-xs font-mono w-6">
                            {item.type === 'directory' ? '📁' : '📄'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-sm truncate">{item.path}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Main Functions/Components */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" />
                    Key Functions & Components
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {projectAnalysis.mainFunctions.map((func, index) => (
                      <AccordionItem key={index} value={`func-${index}`}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{func.file}</Badge>
                            <span className="font-mono text-sm">{func.name}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <p className="text-muted-foreground">{func.description}</p>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>

              {/* Project Explanation */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Project Explanation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                        {projectAnalysis.explanation}
                      </pre>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Improvements */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    Improvement Suggestions
                  </CardTitle>
                  <CardDescription>
                    What can be improved to make this repository more fork-worthy
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {projectAnalysis.improvements.map((improvement, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg border"
                      >
                        <Badge
                          variant={
                            improvement.priority === 'high' ? 'destructive' :
                            improvement.priority === 'medium' ? 'default' : 'secondary'
                          }
                        >
                          {improvement.priority}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-medium">{improvement.title}</p>
                          <p className="text-sm text-muted-foreground">{improvement.description}</p>
                        </div>
                        <Badge variant="outline">{improvement.category}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Ask Questions / Chat Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    Ask Questions About This Project
                  </CardTitle>
                  <CardDescription>
                    Have questions about the data, model, or implementation? Ask anything to prepare for your interview!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Suggested Questions */}
                  {chatMessages.length === 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-2">Try asking:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'What features does the dataset have?',
                          'How was the model trained?',
                          'What is the size of the dataset?',
                          'What preprocessing was done on the data?'
                        ].map((q, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            onClick={() => setChatInput(q)}
                            className="text-xs"
                          >
                            {q}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat Messages */}
                  <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input */}
                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <Input
                      placeholder="Ask about the project, data, model, etc..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isChatLoading}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={!chatInput.trim() || isChatLoading}>
                      {isChatLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Quiz Prompt */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6">
                  <div className="text-center mb-6">
                    <div className="p-3 bg-primary/10 rounded-full w-fit mx-auto mb-4">
                      <GraduationCap className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold text-xl mb-2">Ready to Test Your Knowledge?</h3>
                    <p className="text-muted-foreground">
                      Choose your interview style
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* MCQ Quiz */}
                    <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-500/10 rounded-lg">
                            <CheckCircle2 className="h-5 w-5 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">MCQ Quiz</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              15 multiple choice questions from basic to advanced
                            </p>
                            <Button 
                              size="sm" 
                              onClick={handleStartQuiz} 
                              disabled={isGeneratingQuiz}
                              className="w-full"
                            >
                              {isGeneratingQuiz ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                'Start MCQ Quiz'
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Viva Interview */}
                    <Card className="cursor-pointer hover:border-primary/50 transition-colors border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-green-500/10 rounded-lg">
                            <Mic className="h-5 w-5 text-green-500" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">Voice Interview</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              10 oral questions with voice support - speak or type your answers
                            </p>
                            <Button 
                              size="sm" 
                              onClick={handleStartViva} 
                              disabled={isGeneratingViva}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              {isGeneratingViva ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Mic className="h-4 w-4 mr-2" />
                                  Start Voice Interview
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <Button variant="ghost" onClick={() => reset()}>
                      Skip & Go Home
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Viva Interview View */}
          {currentView === 'viva' && vivaSession && !showVivaFeedback && (
            <motion.div
              key="viva"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              {/* Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Question {vivaSession.currentQuestion + 1} of {vivaSession.questions.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Average Score: {vivaSession.answers.length > 0 
                      ? Math.round(vivaSession.totalScore / vivaSession.answers.length) 
                      : 0}%
                  </span>
                </div>
                <Progress 
                  value={((vivaSession.currentQuestion + 1) / vivaSession.questions.length) * 100} 
                  className="h-2"
                />
              </div>

              {/* Question Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {vivaSession.questions[vivaSession.currentQuestion].category}
                      </Badge>
                      <Badge variant={
                        vivaSession.questions[vivaSession.currentQuestion].difficulty === 'basic' ? 'secondary' :
                        vivaSession.questions[vivaSession.currentQuestion].difficulty === 'intermediate' ? 'default' : 'destructive'
                      }>
                        {vivaSession.questions[vivaSession.currentQuestion].difficulty}
                      </Badge>
                    </div>
                    {/* Voice Mode Toggle & Speak Question Button */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsVoiceMode(!isVoiceMode)}
                        className={isVoiceMode ? 'bg-green-500/10 text-green-600 border-green-500/30' : ''}
                      >
                        {isVoiceMode ? (
                          <>
                            <Mic className="h-4 w-4 mr-1" />
                            Voice Mode
                          </>
                        ) : (
                          <>
                            <MicOff className="h-4 w-4 mr-1" />
                            Text Mode
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => speakQuestion(vivaSession.questions[vivaSession.currentQuestion].question)}
                        disabled={isSpeaking}
                      >
                        {isSpeaking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-xl pr-8">
                    {vivaSession.questions[vivaSession.currentQuestion].question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      💡 Tips for a good answer:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      {vivaSession.questions[vivaSession.currentQuestion].keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Voice Mode Controls */}
                  {isVoiceMode && (
                    <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-center gap-4">
                        {!isRecording ? (
                          <Button
                            size="lg"
                            onClick={startRecording}
                            disabled={isTranscribing || isEvaluatingAnswer}
                            className="bg-green-600 hover:bg-green-700 text-white px-8"
                          >
                            <Mic className="h-5 w-5 mr-2" />
                            Start Recording
                          </Button>
                        ) : (
                          <Button
                            size="lg"
                            onClick={stopRecording}
                            variant="destructive"
                            className="px-8"
                          >
                            <Square className="h-5 w-5 mr-2" />
                            Stop Recording
                          </Button>
                        )}
                      </div>
                      
                      {isRecording && (
                        <div className="flex items-center justify-center gap-2 text-red-500">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                          </span>
                          <span className="text-sm font-medium">Recording... Speak your answer clearly</span>
                        </div>
                      )}
                      
                      {isTranscribing && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Transcribing your answer...</span>
                        </div>
                      )}

                      {audioUrl && !isRecording && (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm text-muted-foreground">Your recording:</span>
                          <audio controls src={audioUrl} className="h-8" />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {isVoiceMode ? 'Your Answer (transcribed or edit):' : 'Your Answer:'}
                    </label>
                    <textarea
                      value={vivaAnswer}
                      onChange={(e) => setVivaAnswer(e.target.value)}
                      placeholder={isVoiceMode 
                        ? "Your spoken answer will appear here. You can edit it if needed..." 
                        : "Type your answer here as you would say it in an interview..."}
                      className="w-full min-h-[150px] p-3 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={isEvaluatingAnswer || isTranscribing}
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {vivaAnswer.length} characters
                    </span>
                    <Button
                      onClick={handleVivaSubmit}
                      disabled={!vivaAnswer.trim() || isEvaluatingAnswer || isTranscribing}
                    >
                      {isEvaluatingAnswer ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Evaluating...
                        </>
                      ) : (
                        <>
                          Submit Answer
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Viva Feedback View */}
          {currentView === 'viva' && vivaSession && showVivaFeedback && vivaSession.answers.length > 0 && (
            <motion.div
              key="viva-feedback"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Feedback on Your Answer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Score */}
                  <div className="flex items-center gap-4">
                    <div className={`text-4xl font-bold ${
                      vivaSession.answers[vivaSession.answers.length - 1].score >= 80 ? 'text-green-500' :
                      vivaSession.answers[vivaSession.answers.length - 1].score >= 60 ? 'text-yellow-500' : 'text-orange-500'
                    }`}>
                      {vivaSession.answers[vivaSession.answers.length - 1].score}%
                    </div>
                    <div>
                      <p className="font-medium">
                        {vivaSession.answers[vivaSession.answers.length - 1].score >= 80 ? 'Excellent Answer!' :
                         vivaSession.answers[vivaSession.answers.length - 1].score >= 60 ? 'Good Answer' : 'Needs Improvement'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {vivaSession.answers[vivaSession.answers.length - 1].feedback}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Strengths */}
                  {vivaSession.answers[vivaSession.answers.length - 1].strengths.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-green-600 dark:text-green-400">✓ Strengths</h4>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {vivaSession.answers[vivaSession.answers.length - 1].strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {vivaSession.answers[vivaSession.answers.length - 1].improvements.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-orange-600 dark:text-orange-400">↑ Areas to Improve</h4>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {vivaSession.answers[vivaSession.answers.length - 1].improvements.map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Separator />

                  {/* Model Answer */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2">📖 Model Answer</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {vivaSession.answers[vivaSession.answers.length - 1].modelAnswer}
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleNextVivaQuestion}
                  >
                    {vivaSession.currentQuestion < vivaSession.questions.length - 1 
                      ? 'Next Question' 
                      : 'See Final Results'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Viva Results View */}
          {currentView === 'viva-results' && vivaSession && (
            <motion.div
              key="viva-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <Card className="text-center">
                <CardContent className="p-8 space-y-6">
                  <div className="flex justify-center">
                    <div className="p-4 rounded-full bg-primary/10">
                      <Trophy className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  
                  <div>
                    <h2 className="text-3xl font-bold">{getVivaScoreMessage().title}</h2>
                    <p className={`text-lg mt-2 ${getVivaScoreMessage().color}`}>
                      {getVivaScoreMessage().message}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <div className="relative w-40 h-40">
                      <svg className="w-40 h-40 transform -rotate-90">
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          className="text-muted"
                        />
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${(vivaSession.totalScore / vivaSession.answers.length) * 4.4} 440`}
                          className={
                            (vivaSession.totalScore / vivaSession.answers.length) >= 80 
                              ? 'text-green-500' 
                              : (vivaSession.totalScore / vivaSession.answers.length) >= 60 
                                ? 'text-yellow-500' 
                                : 'text-orange-500'
                          }
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <span className="text-4xl font-bold">
                            {Math.round(vivaSession.totalScore / vivaSession.answers.length)}%
                          </span>
                          <p className="text-sm text-muted-foreground">
                            Average Score
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-left">
                    <h4 className="font-medium mb-3">Answer Summary</h4>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {vivaSession.answers.map((answer, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border ${
                              answer.score >= 80 ? 'border-green-500/20 bg-green-500/10' :
                              answer.score >= 60 ? 'border-yellow-500/20 bg-yellow-500/10' : 
                              'border-orange-500/20 bg-orange-500/10'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">Q{index + 1}</span>
                              <Badge variant={answer.score >= 80 ? 'default' : answer.score >= 60 ? 'secondary' : 'destructive'}>
                                {answer.score}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{answer.question}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => reset()}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Try Another Project
                    </Button>
                    <Button onClick={() => setCurrentView('explanation')}>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Review Explanation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Quiz View */}
          {currentView === 'quiz' && quizSession && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              {/* Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Question {quizSession.currentQuestion + 1} of {quizSession.questions.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Score: {quizSession.score}/{quizSession.questions.length}
                  </span>
                </div>
                <Progress 
                  value={((quizSession.currentQuestion + 1) / quizSession.questions.length) * 100} 
                  className="h-2"
                />
              </div>

              {quizSession.currentQuestion < quizSession.questions.length && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={
                        quizSession.questions[quizSession.currentQuestion].difficulty === 'basic' ? 'secondary' :
                        quizSession.questions[quizSession.currentQuestion].difficulty === 'intermediate' ? 'default' : 'destructive'
                      }>
                        {quizSession.questions[quizSession.currentQuestion].difficulty}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">
                      {quizSession.questions[quizSession.currentQuestion].question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {quizSession.questions[quizSession.currentQuestion].options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedAnswer(option)}
                        disabled={selectedAnswer !== null}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          selectedAnswer === option
                            ? 'border-primary bg-primary/10'
                            : 'hover:border-primary/50 hover:bg-muted/50'
                        } ${selectedAnswer !== null ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full border flex items-center justify-center text-sm font-medium">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span>{option}</span>
                        </div>
                      </button>
                    ))}

                    {selectedAnswer && (
                      <div className="mt-4 p-4 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-2">
                          {quizSession.questions[quizSession.currentQuestion].options.indexOf(selectedAnswer) === 
                           quizSession.questions[quizSession.currentQuestion].correctAnswer ? (
                            <>
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              <span className="font-medium text-green-500">Correct!</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-5 w-5 text-red-500" />
                              <span className="font-medium text-red-500">Incorrect</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {quizSession.questions[quizSession.currentQuestion].explanation}
                        </p>
                      </div>
                    )}

                    <Button
                      className="w-full mt-4"
                      onClick={handleAnswerSubmit}
                      disabled={!selectedAnswer}
                    >
                      {quizSession.currentQuestion < quizSession.questions.length - 1 
                        ? 'Next Question' 
                        : 'See Results'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Results View */}
          {currentView === 'results' && quizSession && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <Card className="text-center">
                <CardContent className="p-8 space-y-6">
                  <div className="flex justify-center">
                    <div className="p-4 rounded-full bg-primary/10">
                      <Trophy className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  
                  <div>
                    <h2 className="text-3xl font-bold">{getScoreMessage().title}</h2>
                    <p className={`text-lg mt-2 ${getScoreMessage().color}`}>
                      {getScoreMessage().message}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <div className="relative w-40 h-40">
                      <svg className="w-40 h-40 transform -rotate-90">
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          className="text-muted"
                        />
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${(quizSession.score / quizSession.questions.length) * 440} 440`}
                          className={
                            (quizSession.score / quizSession.questions.length) >= 0.75 
                              ? 'text-green-500' 
                              : (quizSession.score / quizSession.questions.length) >= 0.5 
                                ? 'text-yellow-500' 
                                : 'text-orange-500'
                          }
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <span className="text-4xl font-bold">
                            {Math.round((quizSession.score / quizSession.questions.length) * 100)}%
                          </span>
                          <p className="text-sm text-muted-foreground">
                            {quizSession.score}/{quizSession.questions.length} correct
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Answer Review */}
                  <div className="text-left">
                    <h3 className="font-semibold mb-4">Answer Review</h3>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {quizSession.answers.map((answer, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border ${
                              answer.isCorrect 
                                ? 'border-green-500/20 bg-green-500/10' 
                                : 'border-red-500/20 bg-red-500/10'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {answer.isCorrect ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <p className="font-medium text-sm">{answer.question}</p>
                                {!answer.isCorrect && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Your answer: {answer.userAnswer} | Correct: {answer.correctAnswer}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {answer.explanation}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => reset()}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Try Another Project
                    </Button>
                    <Button onClick={() => setCurrentView('explanation')}>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Review Explanation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-background">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>GitExplainer - AI-Powered GitHub Project Understanding Tool</p>
          <p className="mt-1">Helping students master any codebase with confidence</p>
        </div>
      </footer>
    </div>
  )
}
