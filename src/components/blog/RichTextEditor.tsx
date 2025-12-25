import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import {
  Bold, Italic, Strikethrough, List, ListOrdered,
  Quote, Undo, Redo, Link as LinkIcon, Image as ImageIcon,
  Heading2, Heading3, Code, Sparkles, Loader2
} from 'lucide-react'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  const [isAIModalOpen, setIsAIModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { toast } = useToast()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4',
      },
    },
  })

  if (!editor) {
    return null
  }

  // Toolbar button component
  const ToolbarButton = ({ onClick, active, children, title }: any) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-2 rounded hover:bg-gray-100 transition ${active ? 'bg-gray-200' : ''}`}
      title={title}
    >
      {children}
    </button>
  )

  // Handle AI content generation
  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Please enter a topic or instructions for the AI',
        variant: 'destructive',
      })
      return
    }

    setIsGenerating(true)

    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-content', {
        body: {
          topic: aiPrompt,
          category: 'General',
          keywords: aiPrompt,
          wordCount: 1500,
        },
      })

      if (error) throw error

      if (data.success && data.data.content) {
        // Insert generated content into editor
        editor.commands.setContent(data.data.content)

        toast({
          title: 'Content generated!',
          description: `Generated ${data.data.wordCount} words in ${data.data.readTimeMinutes} min read time`,
        })

        setIsAIModalOpen(false)
        setAiPrompt('')
      } else {
        throw new Error('No content generated')
      }
    } catch (error) {
      console.error('AI generation error:', error)
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate content with AI',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Add link
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  // Add image
  const addImage = () => {
    const url = window.prompt('Image URL')

    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  // Calculate word count
  const wordCount = editor.getText().split(/\s+/).filter(word => word.length > 0).length

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="bg-gray-50 border-b p-2 flex items-center gap-1 flex-wrap">
        {/* AI Generation Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAIModalOpen(true)}
          className="mr-2"
        >
          <Sparkles className="w-4 h-4 mr-1" />
          Generate with AI
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (Cmd+B)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (Cmd+I)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Other */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Quote"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={setLink}
          active={editor.isActive('link')}
          title="Add Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={addImage}
          title="Add Image"
        >
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo (Cmd+Z)"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{Math.ceil(wordCount / 200)} min read</span>
        </div>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="bg-white" />

      {/* AI Generation Modal */}
      <Dialog open={isAIModalOpen} onOpenChange={setIsAIModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Generate Content with AI
            </DialogTitle>
            <DialogDescription>
              Describe what you want the blog post to be about. Be as specific as possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">What should this post cover?</Label>
              <Textarea
                id="ai-prompt"
                placeholder="e.g., Tips for entrepreneurs to get booked on business podcasts, how to pitch podcast hosts effectively, common mistakes in podcast guesting..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                disabled={isGenerating}
              />
            </div>

            <div className="text-sm text-gray-500">
              <strong>Note:</strong> Generated content will replace any existing content in the editor.
              Make sure to save your work first!
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAIModalOpen(false)
                setAiPrompt('')
              }}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGenerateWithAI}
              disabled={isGenerating || !aiPrompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
