import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

interface GitHubRepo {
  name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  default_branch: string
}

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  content?: string
  download_url: string | null
}

async function fetchGitHubRepo(url: string): Promise<GitHubRepo | null> {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null
    
    const [, owner, repo] = match
    const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '')
    
    console.log(`Fetching repo: ${owner}/${cleanRepo}`)
    
    const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitExplainer/1.0'
      }
    })
    
    console.log(`GitHub API response status: ${response.status}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`GitHub API error: ${response.status} - ${errorText}`)
      return null
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching GitHub repo:', error)
    return null
  }
}

async function fetchRepoContents(url: string): Promise<GitHubContent[]> {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return []
    
    const [, owner, repo] = match
    const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '')
    const contents: GitHubContent[] = []
    
    // Fetch root contents
    const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitExplainer/1.0'
      }
    })
    
    if (!response.ok) return []
    const rootContents = await response.json()
    contents.push(...rootContents)
    
    // Fetch important directories (src, app, lib, components, etc.)
    const importantDirs = ['src', 'app', 'lib', 'components', 'pages', 'api', 'utils', 'hooks', 'services', 'models', 'controllers', 'notebooks', 'data', 'scripts', 'tests', 'test', '__tests__']
    
    for (const item of rootContents) {
      if (item.type === 'dir' && importantDirs.includes(item.name)) {
        const dirResponse = await fetch(
          `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${item.name}`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'GitExplainer/1.0'
            }
          }
        )
        
        if (dirResponse.ok) {
          const dirContents = await dirResponse.json()
          contents.push(...dirContents.slice(0, 20)) // Limit items per directory
        }
      }
    }
    
    return contents
  } catch (error) {
    console.error('Error fetching repo contents:', error)
    return []
  }
}

async function getReadmeContent(url: string): Promise<string> {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return ''
    
    const [, owner, repo] = match
    const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '')
    
    // Try different README names
    const readmeNames = ['README.md', 'readme.md', 'README.MD', 'readme', 'README', 'README.rst', 'README.txt']
    
    for (const name of readmeNames) {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${name}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'GitExplainer/1.0'
          }
        }
      )
      
      if (response.ok) {
        return await response.text()
      }
    }
    
    return ''
  } catch (error) {
    console.error('Error fetching README:', error)
    return ''
  }
}

// Fallback: Use web-reader to get content from GitHub page
async function fetchGitHubPageContent(url: string): Promise<{ title: string; content: string }> {
  try {
    const zai = await ZAI.create()
    
    const result = await zai.functions.invoke('page_reader', {
      url: url
    })
    
    return {
      title: result.data?.title || 'Unknown Repository',
      content: result.data?.text || ''
    }
  } catch (error) {
    console.error('Error fetching GitHub page:', error)
    return { title: 'Unknown Repository', content: '' }
  }
}

async function analyzeWithAI(
  repo: GitHubRepo | null,
  contents: GitHubContent[],
  readme: string,
  githubUrl: string,
  pageContent?: { title: string; content: string }
): Promise<{
  techStack: Array<{ name: string; category: string; description: string }>
  directoryStructure: Array<{ name: string; type: 'file' | 'directory'; description: string; path: string }>
  mainFunctions: Array<{ name: string; file: string; description: string; lineNumber?: number }>
  explanation: string
  improvements: Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low'; category: string }>
}> {
  const zai = await ZAI.create()

  // Build context from available data
  const repoInfo = repo ? {
    name: repo.name,
    description: repo.description || 'No description',
    language: repo.language || 'Unknown',
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    topics: repo.topics?.join(', ') || 'None'
  } : {
    name: pageContent?.title?.replace('GitHub - ', '').split(':')[0] || 'Unknown',
    description: pageContent?.title?.split(':')[1]?.trim() || 'No description available',
    language: 'Unknown',
    stars: 0,
    forks: 0,
    topics: 'None'
  }

  const fileList = contents.length > 0 
    ? contents.map(c => `${c.type === 'dir' ? '📁' : '📄'} ${c.path}`).join('\n')
    : 'File structure not available from API. Using page content instead.'

  const readmeContent = readme || pageContent?.content?.slice(0, 5000) || 'No README content available'

  const prompt = `You are an expert software developer and code reviewer. Analyze this GitHub repository and provide a comprehensive breakdown.

Repository Information:
- Name: ${repoInfo.name}
- Description: ${repoInfo.description}
- Primary Language: ${repoInfo.language}
- Stars: ${repoInfo.stars}
- Forks: ${repoInfo.forks}
- Topics: ${repoInfo.topics}
- URL: ${githubUrl}

README Content:
${readmeContent}

File Structure:
${fileList}

${pageContent?.content ? `
Additional Page Content:
${pageContent.content.slice(0, 3000)}
` : ''}

Please provide a JSON response with the following structure (NO markdown, just pure JSON):
{
  "techStack": [
    {"name": "Technology Name", "category": "Frontend/Backend/Database/Machine Learning/etc", "description": "Brief description"}
  ],
  "directoryStructure": [
    {"name": "filename", "type": "file/directory", "description": "What this file/folder does", "path": "relative/path"}
  ],
  "mainFunctions": [
    {"name": "functionName", "file": "path/to/file", "description": "What this function does", "lineNumber": 10}
  ],
  "explanation": "A comprehensive paragraph explaining what this project does, how it works, its architecture, and key concepts. Make it educational for someone trying to understand the codebase.",
  "improvements": [
    {"title": "Improvement Title", "description": "Detailed description", "priority": "high/medium/low", "category": "Documentation/Code Quality/Performance/etc"}
  ]
}

Provide at least:
- 5-10 tech stack items (infer from the project type and language if not explicitly stated)
- 15-25 directory structure items (make reasonable assumptions based on the project type)
- 5-10 main functions/components
- 5-8 improvement suggestions
- A detailed 300+ word explanation`

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: 'You are an expert software developer who analyzes GitHub repositories and provides detailed, educational breakdowns. Always respond with valid JSON only, no markdown formatting.'
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
    // Try to extract JSON from the response
    let jsonStr = response.trim()
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    return JSON.parse(jsonStr)
  } catch {
    // Return default structure if parsing fails
    return {
      techStack: [{ name: repoInfo.language, category: 'Language', description: 'Primary programming language' }],
      directoryStructure: contents.slice(0, 20).map(c => ({
        name: c.name,
        type: c.type === 'dir' ? 'directory' : 'file',
        description: `${c.type === 'dir' ? 'Directory' : 'File'} in the project`,
        path: c.path
      })),
      mainFunctions: [],
      explanation: `This is a ${repoInfo.language} project named "${repoInfo.name}". ${repoInfo.description} The project is hosted on GitHub at ${githubUrl}.`,
      improvements: []
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { githubUrl } = await request.json()

    if (!githubUrl) {
      return NextResponse.json({ error: 'GitHub URL is required' }, { status: 400 })
    }

    // Validate GitHub URL
    const githubPattern = /^https?:\/\/github\.com\/[^/]+\/[^/]+/
    if (!githubPattern.test(githubUrl)) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
    }

    console.log('Starting analysis for:', githubUrl)

    // Fetch repository information
    let repo = await fetchGitHubRepo(githubUrl)
    
    // If GitHub API fails, use web-reader as fallback
    let pageContent: { title: string; content: string } | undefined
    
    if (!repo) {
      console.log('GitHub API failed, using web-reader fallback...')
      pageContent = await fetchGitHubPageContent(githubUrl)
      
      // Create a minimal repo object from page content
      const repoName = pageContent.title
        .replace('GitHub - ', '')
        .split(':')[0]
        .split('/')[1]
        ?.trim() || 'Unknown'
      
      repo = {
        name: repoName,
        description: pageContent.title.split(':')[1]?.trim() || null,
        html_url: githubUrl,
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        topics: [],
        default_branch: 'main'
      }
    }

    // Fetch repository contents (may be empty if API is rate limited)
    const contents = await fetchRepoContents(githubUrl)
    console.log(`Fetched ${contents.length} content items`)
    
    // Fetch README
    const readme = await getReadmeContent(githubUrl)
    console.log(`README length: ${readme.length}`)

    // Analyze with AI
    const analysis = await analyzeWithAI(repo, contents, readme, githubUrl, pageContent)

    // Save to database
    const savedAnalysis = await db.projectAnalysis.create({
      data: {
        githubUrl,
        repoName: repo.name,
        repoDescription: repo.description,
        techStack: JSON.stringify(analysis.techStack),
        directoryStructure: JSON.stringify(analysis.directoryStructure),
        mainFunctions: JSON.stringify(analysis.mainFunctions),
        explanation: analysis.explanation,
        improvements: JSON.stringify(analysis.improvements)
      }
    })

    console.log('Analysis saved successfully')

    // Return the analysis with proper types
    return NextResponse.json({
      analysis: {
        id: savedAnalysis.id,
        githubUrl: savedAnalysis.githubUrl,
        repoName: savedAnalysis.repoName,
        repoDescription: savedAnalysis.repoDescription,
        techStack: analysis.techStack,
        directoryStructure: analysis.directoryStructure,
        mainFunctions: analysis.mainFunctions,
        explanation: savedAnalysis.explanation,
        improvements: analysis.improvements,
        createdAt: savedAnalysis.createdAt.toISOString()
      }
    })
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    )
  }
}
