import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Placeholder } from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';

// Resizable Image Component
const ResizableImage: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const { src, alt, width, alignment, caption } = node.attrs;

  const handleMouseDown = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = imageRef.current?.offsetWidth || 200;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = corner.includes('right')
        ? e.clientX - startX.current
        : startX.current - e.clientX;
      const newWidth = Math.max(50, startWidth.current + diff);
      updateAttributes({ width: newWidth });
    };

    const cleanup = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', cleanup);
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', cleanup);
  };

  const handleAlignmentChange = (newAlignment: string) => {
    updateAttributes({ alignment: newAlignment });
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ caption: e.target.value });
  };

  const alignmentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems:
      alignment === 'center'
        ? 'center'
        : alignment === 'right'
          ? 'flex-end'
          : 'flex-start',
  };

  return (
    <NodeViewWrapper className="resizable-image-wrapper" style={alignmentStyle}>
      <div
        className={`resizable-image-container ${selected ? 'selected' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          style={{ width: '100%', display: 'block' }}
          draggable={false}
        />
        {selected && (
          <>
            {/* Resize handles */}
            <div
              className="resize-handle resize-handle-nw"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
            <div
              className="resize-handle resize-handle-ne"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
            <div
              className="resize-handle resize-handle-sw"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
            <div
              className="resize-handle resize-handle-se"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
            {/* Alignment buttons */}
            <div className="image-toolbar">
              <button
                className={`image-toolbar-btn ${alignment === 'left' ? 'active' : ''}`}
                onClick={() => handleAlignmentChange('left')}
                title="Align Left"
              >
                <AlignLeftIcon />
              </button>
              <button
                className={`image-toolbar-btn ${alignment === 'center' ? 'active' : ''}`}
                onClick={() => handleAlignmentChange('center')}
                title="Align Center"
              >
                <AlignCenterIcon />
              </button>
              <button
                className={`image-toolbar-btn ${alignment === 'right' ? 'active' : ''}`}
                onClick={() => handleAlignmentChange('right')}
                title="Align Right"
              >
                <AlignRightIcon />
              </button>
            </div>
          </>
        )}
      </div>
      {/* Caption input - always visible if has caption or selected */}
      {(caption || selected) && (
        <input
          type="text"
          className="image-caption-input"
          placeholder="Add caption..."
          value={caption || ''}
          onChange={handleCaptionChange}
          style={{ width: width ? `${width}px` : '100%', maxWidth: '100%' }}
        />
      )}
    </NodeViewWrapper>
  );
};

// Alignment Icons
const AlignLeftIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="18" y2="18" />
  </svg>
);

const AlignCenterIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const AlignRightIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="9" y1="12" x2="21" y2="12" />
    <line x1="6" y1="18" x2="21" y2="18" />
  </svg>
);

// Custom Image extension with resize, alignment, and caption
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          return width ? parseInt(width, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      alignment: {
        default: 'left',
        parseHTML: (element) =>
          element.getAttribute('data-alignment') || 'left',
        renderHTML: (attributes) => {
          return { 'data-alignment': attributes.alignment };
        },
      },
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') || '',
        renderHTML: (attributes) => {
          if (!attributes.caption) return {};
          return { 'data-caption': attributes.caption };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImage);
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
  },
});

// Toolbar Icons
const BoldIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </svg>
);

const ItalicIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const HeadingIcon = ({ level }: { level: number }) => (
  <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '-0.5px' }}>
    H<sub style={{ fontSize: '10px', fontWeight: 700 }}>{level}</sub>
  </span>
);

const ListIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const OrderedListIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

const QuoteIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
  </svg>
);

const UndoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const RedoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
  </svg>
);

const TableIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

const CopyIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

interface DocumentEditorProps {
  initialContent: string;
  onContentChange?: (content: string) => void;
  images?: Array<{
    id: string;
    label: string;
    src: string;
  }>;
  filename?: string;
}

const MenuButton: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, isActive, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`editor-menu-btn ${isActive ? 'active' : ''}`}
  >
    {children}
  </button>
);

const DocumentEditor: React.FC<DocumentEditorProps> = ({
  initialContent,
  onContentChange,
  images = [],
  filename = 'document',
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      CustomImage.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Start typing or paste OCR content...',
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      if (onContentChange) {
        onContentChange(editor.getHTML());
      }
    },
  });

  // Update content when initialContent changes
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]);

  const handleCopy = useCallback(async () => {
    if (!editor) return;
    const text = editor.getText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [editor]);

  const handleDownload = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^/.]+$/, '') + '_ocr.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [editor, filename]);

  const insertImage = useCallback(
    (src: string) => {
      if (editor) {
        editor.chain().focus().setImage({ src }).run();
      }
    },
    [editor],
  );

  const insertTable = useCallback(() => {
    if (editor) {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    }
  }, [editor]);

  if (!editor) {
    return <div className="editor-loading">Loading editor...</div>;
  }

  return (
    <div className="document-editor-container">
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="editor-toolbar-group">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <BoldIcon />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic"
          >
            <ItalicIcon />
          </MenuButton>
        </div>

        <div className="editor-toolbar-divider" />

        <div className="editor-toolbar-group">
          <MenuButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <HeadingIcon level={1} />
          </MenuButton>
          <MenuButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <HeadingIcon level={2} />
          </MenuButton>
          <MenuButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <HeadingIcon level={3} />
          </MenuButton>
        </div>

        <div className="editor-toolbar-divider" />

        <div className="editor-toolbar-group">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <ListIcon />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <OrderedListIcon />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <QuoteIcon />
          </MenuButton>
        </div>

        <div className="editor-toolbar-divider" />

        <div className="editor-toolbar-group">
          <MenuButton onClick={insertTable} title="Insert Table">
            <TableIcon />
          </MenuButton>
          {images.length > 0 && (
            <select
              className="editor-image-select"
              onChange={(e) => {
                if (e.target.value) {
                  insertImage(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Insert Image
              </option>
              {images.map((img) => (
                <option key={img.id} value={img.src}>
                  {img.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="editor-toolbar-divider" />

        <div className="editor-toolbar-group">
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <UndoIcon />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <RedoIcon />
          </MenuButton>
        </div>

        <div className="editor-toolbar-spacer" />

        <div className="editor-toolbar-group">
          <button className="btn btn-sm btn-outline" onClick={handleCopy}>
            <CopyIcon /> Copy
          </button>
          <button className="btn btn-sm btn-outline" onClick={handleDownload}>
            <DownloadIcon /> Download
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
};

export default DocumentEditor;
