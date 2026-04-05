import React from 'react';
import DOMPurify from 'dompurify';
import { OcrBlock } from '../../types/ocr';

export interface BlockPreviewModalProps {
  selectedBlock: OcrBlock | null;
  selectedBlockImage: string | null;
  previewUrl: string | null;
  onClose: () => void;
}

export const BlockPreviewModal: React.FC<BlockPreviewModalProps> = ({
  selectedBlock,
  selectedBlockImage,
  previewUrl,
  onClose,
}) => {
  if (!selectedBlock || !previewUrl) return null;

  const [x1, y1, x2, y2] = selectedBlock.block_bbox;
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;

  return (
    <div
      className="block-preview-overlay"
      onClick={onClose}
    >
      <div
        className="block-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="block-preview-header">
          <span className={`block-label ${selectedBlock.block_label}`}>
            {selectedBlock.block_label}
          </span>
          <span className="block-preview-info">
            Block #{selectedBlock.block_id} | {cropWidth}×{cropHeight}px
          </span>
          <button
            className="block-preview-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="block-preview-body">
          <div className="block-preview-image-section">
            <div className="block-preview-section-label">Original Image</div>
            <div className="block-preview-image-container">
              {selectedBlockImage ? (
                <img
                  src={selectedBlockImage}
                  alt={`${selectedBlock.block_label} block preview`}
                  className="block-preview-image"
                />
              ) : (
                <div className="block-preview-loading">Loading image...</div>
              )}
            </div>
          </div>
          <div className="block-preview-text-section">
            <div className="block-preview-section-label">OCR Result</div>
            <div className="block-preview-text-content">
              {selectedBlock.block_content?.trim() ? (
                selectedBlock.block_label === 'table' ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(selectedBlock.block_content),
                    }}
                  />
                ) : (
                  <pre>{selectedBlock.block_content}</pre>
                )
              ) : (
                <div className="block-preview-no-text">No text content</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
