import React from 'react';
import { OcrBlock, OcrV5ResultData, getV5Bbox } from '../../types/ocr';

export interface V5BlocksViewProps {
  data: OcrV5ResultData;
  hoveredBlockId: number | null;
  setHoveredBlockId: (id: number | null) => void;
  setSelectedBlock: (block: OcrBlock | null) => void;
}

export const V5BlocksView: React.FC<V5BlocksViewProps> = ({
  data,
  hoveredBlockId,
  setHoveredBlockId,
  setSelectedBlock,
}) => {
  const texts = data.rec_texts || [];
  const scores = data.rec_scores || [];

  const handleV5BlockClick = (idx: number) => {
    const bbox = getV5Bbox(data, idx);
    if (bbox[0] === 0 && bbox[1] === 0 && bbox[2] === 0 && bbox[3] === 0)
      return;

    // Create synthetic OcrBlock for the modal
    const syntheticBlock: OcrBlock = {
      block_id: idx,
      block_label: 'text',
      block_content: texts[idx] || '',
      block_bbox: bbox,
      block_order: idx,
      group_id: 0,
    };
    setSelectedBlock(syntheticBlock);
  };

  return (
    <div className="blocks-list">
      {texts.length === 0 ? (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          No text detected
        </div>
      ) : (
        texts.map((text, idx) => (
          <div
            key={idx}
            className={`block-item text ${hoveredBlockId === idx ? 'highlighted' : ''}`}
            onMouseEnter={() => setHoveredBlockId(idx)}
            onMouseLeave={() => setHoveredBlockId(null)}
            onClick={() => handleV5BlockClick(idx)}
            style={{ cursor: 'pointer' }}
          >
            <div className="block-header">
              <span className="block-label text">text</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                #{idx + 1} | Confidence: {(scores[idx] * 100).toFixed(1)}%
              </span>
            </div>
            <div className="block-body">
              <div
                className="block-content"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {text}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
