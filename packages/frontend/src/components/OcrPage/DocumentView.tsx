import React from 'react';
import DocumentEditor from '../DocumentEditor';
import {
  OcrBlock,
  OcrV5ResultData,
  OcrStructureResultData,
  OcrJob,
} from '../../types/ocr';
import { generateDocumentHTML, generateV5DocumentHTML, generateCroppedImages } from '../../utils/ocrHelpers';

export interface DocumentViewProps {
  /** Pass blocks + structData for structure format, null for V5 */
  blocks: OcrBlock[] | null;
  structData: OcrStructureResultData | null;
  /** Pass v5Data for V5 format, null for structure */
  v5Data: OcrV5ResultData | null;
  job: OcrJob | undefined;
  currentPdfPage: number;
  updateJob: (id: string, updates: Partial<OcrJob>) => void;
  croppedImagesMap: Map<number, string>;
  croppedImagesReady: boolean;
  setCroppedImagesMap: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  setCroppedImagesReady: React.Dispatch<React.SetStateAction<boolean>>;
  lastProcessedBlocksRef: React.MutableRefObject<string>;
  loadedImageUrl: string | null;
  previewUrl: string | null;
  resultImageRef: React.RefObject<HTMLImageElement | null>;
}

const VISUAL_BLOCK_TYPES = [
  'image',
  'picture',
  'figure',
  'chart',
  'seal',
  'stamp',
];

export const DocumentView: React.FC<DocumentViewProps> = ({
  blocks,
  structData,
  v5Data,
  job,
  currentPdfPage,
  updateJob,
  croppedImagesMap,
  croppedImagesReady,
  setCroppedImagesMap,
  setCroppedImagesReady,
  lastProcessedBlocksRef,
  loadedImageUrl,
  previewUrl,
  resultImageRef,
}) => {
  const filename = job?.filename || 'document';

  const handleDocumentChange = (content: string) => {
    if (job) {
      updateJob(job.id, {
        editedDocumentHtml: {
          ...job.editedDocumentHtml,
          [currentPdfPage]: content,
        },
      });
    }
  };

  // V5 format
  if (v5Data) {
    const htmlContent = job?.editedDocumentHtml?.[currentPdfPage] || generateV5DocumentHTML(v5Data);
    return (
      <div className="document-view">
        <DocumentEditor
          initialContent={htmlContent}
          filename={filename}
          onContentChange={handleDocumentChange}
        />
      </div>
    );
  }

  // Structure format
  if (!blocks || !structData) return null;

  const hasVisualBlocks = blocks.some((block) =>
    VISUAL_BLOCK_TYPES.includes(block.block_label),
  );

  // Generate cropped images if not already done for these blocks + image
  const jobId = job?.id || '';
  const blocksKey = `${jobId}:${loadedImageUrl}:${blocks.map((b) => b.block_id).join(',')}`;
  const imgElement = resultImageRef.current;
  const imageIsReady =
    imgElement &&
    imgElement.complete &&
    imgElement.naturalWidth > 0 &&
    loadedImageUrl === previewUrl;

  if (
    hasVisualBlocks &&
    imageIsReady &&
    structData.width &&
    structData.height &&
    blocksKey !== lastProcessedBlocksRef.current
  ) {
    lastProcessedBlocksRef.current = blocksKey;
    // Use setTimeout to avoid setState during render
    setTimeout(() => {
      try {
        const croppedMap = generateCroppedImages(blocks, structData, imgElement);
        setCroppedImagesMap(croppedMap);
        setCroppedImagesReady(true);
      } catch (error) {
        console.error('Failed to generate cropped images:', error);
        setCroppedImagesReady(true);
      }
    }, 0);
  }

  // If no visual blocks, mark as ready immediately
  if (!hasVisualBlocks && !croppedImagesReady) {
    setTimeout(() => setCroppedImagesReady(true), 0);
  }

  // Use edited content if available for current page, otherwise generate from result
  const savedHtml = job?.editedDocumentHtml?.[currentPdfPage];
  const savedHtmlHasPlaceholder =
    savedHtml && savedHtml.includes('[IMAGE:') && hasVisualBlocks;

  // Only use cropped images if they belong to the current image
  const currentCroppedImages = (imageIsReady && croppedImagesReady)
    ? croppedImagesMap
    : new Map<number, string>();

  const htmlContent =
    savedHtml && !savedHtmlHasPlaceholder
      ? savedHtml
      : generateDocumentHTML(blocks, structData, currentCroppedImages);

  return (
    <div className="document-view">
      <DocumentEditor
        initialContent={htmlContent}
        filename={filename}
        onContentChange={handleDocumentChange}
      />
    </div>
  );
};
