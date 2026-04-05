import {
  OcrBlock,
  OcrV5ResultData,
  OcrStructureResultData,
} from '../types/ocr';

// Download helper
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Generate markdown from blocks
export function generateMarkdown(blocks: OcrBlock[]): string {
  return blocks
    .map((block) => {
      // Trim whitespace and newlines from content
      const content = (block.block_content || '').replace(
        /^[\s\n]+|[\s\n]+$/g,
        '',
      );
      if (!content) return '';

      if (block.block_label === 'doc_title') {
        return `# ${content}`;
      }
      if (block.block_label === 'paragraph_title') {
        return `## ${content}`;
      }
      if (block.block_label === 'header') {
        return `**${content}**`;
      }
      if (block.block_label === 'table') {
        return block.block_content; // Keep table HTML as-is
      }
      return content;
    })
    .filter((line) => line) // Remove empty lines
    .join('\n\n');
}

// Generate markdown from V5 data
export function generateV5Markdown(data: OcrV5ResultData): string {
  const texts = data.rec_texts || [];
  return texts.join('\n\n');
}

// Helper to convert \n to <br> for HTML rendering
export function nl2br(text: string): string {
  return text.replace(/\n/g, '<br>');
}

// Generate HTML content from blocks for TipTap
export function generateDocumentHTML(
  blocks: OcrBlock[],
  structData: OcrStructureResultData,
  croppedImages: Map<number, string>,
): string {
  const visualBlockTypes = [
    'image',
    'picture',
    'figure',
    'chart',
    'seal',
    'stamp',
  ];

  return blocks
    .map((block) => {
      // Skip empty non-visual blocks
      if (
        !block.block_content?.trim() &&
        !visualBlockTypes.includes(block.block_label)
      ) {
        return '';
      }

      // Visual blocks - always insert cropped image with original bbox size
      if (visualBlockTypes.includes(block.block_label)) {
        const croppedSrc = croppedImages.get(block.block_id);
        if (croppedSrc) {
          const [x1, , x2] = block.block_bbox;
          const width = x2 - x1;
          const caption = block.block_content?.trim();
          // Use img with width attribute (CustomImage extension preserves this)
          let html = `<img src="${croppedSrc}" alt="${block.block_label} #${block.block_id}" width="${width}" />`;
          if (caption) {
            html += `<p><em>${nl2br(caption)}</em></p>`;
          }
          return html;
        }
        return `<p><em>[${block.block_label.toUpperCase()}: Block #${block.block_id}]</em></p>`;
      }

      const content = block.block_content;

      // Render by block type
      switch (block.block_label) {
        case 'doc_title':
          return `<h1>${nl2br(content)}</h1>`;
        case 'paragraph_title':
          return `<h2>${nl2br(content)}</h2>`;
        case 'table':
          return content; // Already HTML
        case 'formula':
        case 'formula_number':
          return `<blockquote><code>${nl2br(content)}</code></blockquote>`;
        case 'header':
          return `<p><strong>${nl2br(content)}</strong></p>`;
        case 'footer':
          return `<p><small>${nl2br(content)}</small></p>`;
        case 'footnotes':
        case 'references':
          return `<blockquote>${nl2br(content)}</blockquote>`;
        default:
          return `<p>${nl2br(content)}</p>`;
      }
    })
    .filter((content) => content)
    .join('');
}

// Generate HTML content from V5 data for TipTap
export function generateV5DocumentHTML(data: OcrV5ResultData): string {
  const texts = data.rec_texts || [];
  if (texts.length === 0) {
    return '<p><em>No text detected</em></p>';
  }
  return texts.map((text) => `<p>${nl2br(text)}</p>`).join('');
}

// Generate cropped images from blocks
export function generateCroppedImages(
  blocks: OcrBlock[],
  structData: OcrStructureResultData,
  imgElement: HTMLImageElement | null,
): Map<number, string> {
  const visualBlockTypes = [
    'image',
    'picture',
    'figure',
    'chart',
    'seal',
    'stamp',
  ];

  if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
    return new Map();
  }

  if (!structData.width || !structData.height) {
    return new Map();
  }

  const visualBlocks = blocks.filter((block) =>
    visualBlockTypes.includes(block.block_label),
  );

  if (visualBlocks.length === 0) {
    return new Map();
  }

  const result = new Map<number, string>();

  visualBlocks.forEach((block) => {
    try {
      const [x1, y1, x2, y2] = block.block_bbox;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Scale factor from original image dimensions
      const scaleX = imgElement.naturalWidth / structData.width;
      const scaleY = imgElement.naturalHeight / structData.height;

      // Crop dimensions
      const cropX = x1 * scaleX;
      const cropY = y1 * scaleY;
      const cropW = (x2 - x1) * scaleX;
      const cropH = (y2 - y1) * scaleY;

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(
        imgElement,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH,
      );

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      result.set(block.block_id, dataUrl);
    } catch (e) {
      console.error(
        'Failed to crop image for block',
        block.block_id,
        e,
      );
    }
  });

  return result;
}
