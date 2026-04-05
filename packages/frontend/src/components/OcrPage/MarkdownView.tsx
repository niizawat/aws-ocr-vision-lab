import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { OcrBlock, OcrV5ResultData, OcrJob } from '../../types/ocr';
import { generateMarkdown, generateV5Markdown, downloadFile } from '../../utils/ocrHelpers';

export interface MarkdownViewProps {
  /** Pass blocks for structure format, null for V5 */
  blocks: OcrBlock[] | null;
  /** Pass data for V5 format, null for structure */
  v5Data: OcrV5ResultData | null;
  job: OcrJob | undefined;
  currentPdfPage: number;
  isMarkdownEditMode: boolean;
  setIsMarkdownEditMode: (mode: boolean) => void;
  updateJob: (id: string, updates: Partial<OcrJob>) => void;
  copyToClipboard: (text: string) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  blocks,
  v5Data,
  job,
  currentPdfPage,
  isMarkdownEditMode,
  setIsMarkdownEditMode,
  updateJob,
  copyToClipboard,
}) => {
  const filename = job?.filename?.replace(/\.[^/.]+$/, '') || 'ocr_result';

  // Generate markdown based on format
  const generatedMarkdown = v5Data
    ? generateV5Markdown(v5Data)
    : blocks
      ? generateMarkdown(blocks)
      : '';

  // Use edited markdown from job if available for current page, otherwise generated
  const displayContent = job?.editedMarkdown?.[currentPdfPage] || generatedMarkdown;

  const handleMarkdownChange = (content: string) => {
    if (job) {
      updateJob(job.id, {
        editedMarkdown: {
          ...job.editedMarkdown,
          [currentPdfPage]: content,
        },
      });
    }
  };

  return (
    <div className="view-with-toolbar">
      <div className="view-toolbar">
        <button
          className={`btn btn-sm ${isMarkdownEditMode ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setIsMarkdownEditMode(!isMarkdownEditMode)}
        >
          {isMarkdownEditMode ? 'Preview' : 'Edit'}
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => copyToClipboard(displayContent)}
        >
          Copy
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={() =>
            downloadFile(displayContent, `${filename}.md`, 'text/markdown')
          }
        >
          Download
        </button>
      </div>
      {isMarkdownEditMode ? (
        <textarea
          className="markdown-editor"
          value={displayContent}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div className="markdown-view">
          <ReactMarkdown
            remarkPlugins={[remarkBreaks]}
            rehypePlugins={[rehypeRaw]}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};
