import React from 'react';
import DOMPurify from 'dompurify';
import { OcrBlock } from '../../types/ocr';

const VISUAL_BLOCK_TYPES = [
  'image',
  'picture',
  'figure',
  'chart',
  'seal',
  'stamp',
];

export interface BlocksViewProps {
  blocks: OcrBlock[];
  hoveredBlockId: number | null;
  setHoveredBlockId: (id: number | null) => void;
  setSelectedBlock: (block: OcrBlock | null) => void;
  croppedImagesMap: Map<number, string>;
}

function renderCroppedImage(block: OcrBlock, croppedImagesMap: Map<number, string>) {
  const croppedSrc = croppedImagesMap.get(block.block_id);
  if (!croppedSrc) {
    return null;
  }

  const [x1, , x2] = block.block_bbox;
  const cropWidth = x2 - x1;

  return (
    <img
      src={croppedSrc}
      alt={`${block.block_label} block`}
      style={{
        width: Math.min(cropWidth, 300),
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '8px',
        background: 'var(--bg-tertiary)',
      }}
    />
  );
}

/** Process blocks: distribute multi-line content within groups, filter empties */
function processBlocks(blocks: OcrBlock[]): OcrBlock[] {
  const processedBlocks = [...blocks];

  // Group blocks by group_id
  const groupMap = new Map<number, number[]>();
  blocks.forEach((block, idx) => {
    const groupId = block.group_id;
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, []);
    }
    groupMap.get(groupId)!.push(idx);
  });

  // For each group, distribute multi-line content to empty blocks
  groupMap.forEach((indices) => {
    if (indices.length <= 1) return;

    const blockWithContent = indices.find(
      (idx) =>
        processedBlocks[idx].block_content &&
        processedBlocks[idx].block_content.trim() !== '',
    );

    if (blockWithContent === undefined) return;

    const contentBlock = processedBlocks[blockWithContent];
    const lines = contentBlock.block_content
      .split('\n')
      .filter((l) => l.trim());

    if (lines.length > 1) {
      const emptyIndices = indices.filter(
        (idx) =>
          idx !== blockWithContent &&
          (!processedBlocks[idx].block_content ||
            processedBlocks[idx].block_content.trim() === ''),
      );

      if (emptyIndices.length > 0) {
        processedBlocks[blockWithContent] = {
          ...contentBlock,
          block_content: lines[0],
        };

        lines.slice(1).forEach((line, i) => {
          if (i < emptyIndices.length) {
            processedBlocks[emptyIndices[i]] = {
              ...processedBlocks[emptyIndices[i]],
              block_content: line,
            };
          }
        });
      }
    }
  });

  // Filter out empty blocks, but keep visual blocks even without content
  return processedBlocks.filter(
    (block) =>
      (block.block_content && block.block_content.trim() !== '') ||
      VISUAL_BLOCK_TYPES.includes(block.block_label),
  );
}

export const BlocksView: React.FC<BlocksViewProps> = ({
  blocks,
  hoveredBlockId,
  setHoveredBlockId,
  setSelectedBlock,
  croppedImagesMap,
}) => {
  const filteredBlocks = processBlocks(blocks);

  return (
    <div className="blocks-list">
      {filteredBlocks.length === 0 ? (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          No blocks detected
        </div>
      ) : (
        filteredBlocks.map((block, idx) => (
          <div
            key={idx}
            className={`block-item ${block.block_label} ${hoveredBlockId === block.block_id ? 'highlighted' : ''}`}
            onMouseEnter={() => setHoveredBlockId(block.block_id)}
            onMouseLeave={() => setHoveredBlockId(null)}
            onClick={() => setSelectedBlock(block)}
            style={{ cursor: 'pointer' }}
          >
            <div className="block-header">
              <span className={`block-label ${block.block_label}`}>
                {block.block_label}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Block #{block.block_id} | Group #{block.group_id}
              </span>
            </div>
            <div className="block-body">
              {block.block_label === 'table' ? (
                <div
                  className="block-content"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.block_content) }}
                />
              ) : VISUAL_BLOCK_TYPES.includes(block.block_label) ? (
                <>
                  {renderCroppedImage(block, croppedImagesMap)}
                  {block.block_content?.trim() && (
                    <div
                      className="block-content"
                      style={{ whiteSpace: 'pre-wrap', marginTop: '12px' }}
                    >
                      {block.block_content}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="block-content"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {block.block_content}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
