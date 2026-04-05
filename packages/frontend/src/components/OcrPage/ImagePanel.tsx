import React from 'react';
import { ZoomInIcon, ZoomOutIcon, FitIcon } from './Icons';
import {
  OcrBlock,
  OcrResultData,
  OcrV5ResultData,
  OcrStructureResultData,
  isOcrV5Result,
  isStructureResult,
  getV5Bbox,
} from '../../types/ocr';

export interface ImagePanelProps {
  previewUrl: string | null;
  loadedImageUrl: string | null;
  resultImageRef: React.RefObject<HTMLImageElement | null>;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  resultData: OcrResultData | null;
  hoveredBlockId: number | null;
  showBbox: boolean;
  setShowBbox: (show: boolean) => void;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  isPanning: boolean;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomFit: () => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  currentPdfPage: number;
  totalPdfPages: number;
  handlePdfPageChange: (page: number) => void;
  setLoadedImageUrl: (url: string | null) => void;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({
  previewUrl,
  loadedImageUrl,
  resultImageRef,
  imageContainerRef,
  resultData,
  hoveredBlockId,
  showBbox,
  setShowBbox,
  zoomLevel,
  panPosition,
  isPanning,
  handleZoomIn,
  handleZoomOut,
  handleZoomFit,
  handleWheel,
  handleMouseDown,
  currentPdfPage,
  totalPdfPages,
  handlePdfPageChange,
  setLoadedImageUrl,
}) => {
  const isV5Format = resultData ? isOcrV5Result(resultData) : false;
  const blocks = resultData && isStructureResult(resultData)
    ? resultData.parsing_res_list
    : [];
  const v5Data = isV5Format && resultData ? (resultData as OcrV5ResultData) : null;

  return (
    <div className="result-image-panel">
      <div className="result-image-header">
        <div className="zoom-controls">
          <button
            className="zoom-btn"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOutIcon />
          </button>
          <span className="zoom-level">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            className="zoom-btn"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomInIcon />
          </button>
          <button
            className="zoom-btn"
            onClick={handleZoomFit}
            title="Fit to Screen"
          >
            <FitIcon />
          </button>
          <span className="zoom-divider" />
          <label
            className="overlay-toggle"
            title="Show/Hide Detection Overlay"
          >
            <input
              type="checkbox"
              checked={showBbox}
              onChange={(e) => setShowBbox(e.target.checked)}
            />
            <span>Overlay</span>
          </label>
        </div>
      </div>
      <div
        className={`result-image-container ${isPanning ? 'dragging' : ''}`}
        ref={imageContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div
          className="result-image-wrapper"
          style={{
            transform: `translate(calc(-50% + ${panPosition.x}px), calc(-50% + ${panPosition.y}px)) scale(${zoomLevel})`,
          }}
        >
          {previewUrl && (
            <>
              <img
                key={previewUrl}
                ref={resultImageRef}
                src={previewUrl}
                alt="Document"
                className="result-image"
                crossOrigin={previewUrl?.startsWith('data:') ? undefined : 'anonymous'}
                onLoad={() => setLoadedImageUrl(previewUrl)}
              />
              {/* Block overlays for Structure format */}
              {showBbox &&
                loadedImageUrl === previewUrl &&
                !isV5Format &&
                resultImageRef.current &&
                blocks.map((block, idx) => {
                  const [x1, y1, x2, y2] = block.block_bbox;
                  const structData = resultData as OcrStructureResultData;
                  const imageEl = resultImageRef.current!;
                  if (!imageEl || !structData.width || !structData.height) return null;
                  const scaleX = imageEl.clientWidth / structData.width;
                  const scaleY = imageEl.clientHeight / structData.height;

                  const isHighlighted = hoveredBlockId === block.block_id;
                  return (
                    <div
                      key={idx}
                      className={`block-overlay ${block.block_label} ${isHighlighted ? 'highlighted' : ''}`}
                      style={{
                        left: x1 * scaleX,
                        top: y1 * scaleY,
                        width: (x2 - x1) * scaleX,
                        height: (y2 - y1) * scaleY,
                      }}
                    />
                  );
                })}
              {/* Block overlays for PP-OCRv5 format */}
              {showBbox &&
                loadedImageUrl === previewUrl &&
                isV5Format &&
                v5Data &&
                resultImageRef.current &&
                v5Data.rec_texts.map((_, idx) => {
                  const [x1, y1, x2, y2] = getV5Bbox(v5Data, idx);
                  if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0)
                    return null;
                  const imageEl = resultImageRef.current;
                  if (!imageEl || !imageEl.naturalWidth || !imageEl.naturalHeight) return null;
                  // Use natural dimensions for scaling
                  const scaleX = imageEl.clientWidth / imageEl.naturalWidth;
                  const scaleY = imageEl.clientHeight / imageEl.naturalHeight;

                  const isHighlighted = hoveredBlockId === idx;
                  return (
                    <div
                      key={idx}
                      className={`block-overlay text ${isHighlighted ? 'highlighted' : ''}`}
                      style={{
                        left: x1 * scaleX,
                        top: y1 * scaleY,
                        width: (x2 - x1) * scaleX,
                        height: (y2 - y1) * scaleY,
                      }}
                    />
                  );
                })}
            </>
          )}
        </div>
      </div>
      <div className="result-image-footer">
        {totalPdfPages > 1 ? (
          <div className="page-nav">
            <button
              className="page-nav-btn"
              onClick={() => handlePdfPageChange(currentPdfPage - 1)}
              disabled={currentPdfPage <= 1}
              title="Previous Page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="page-indicator">
              {currentPdfPage} / {totalPdfPages}
            </span>
            <button
              className="page-nav-btn"
              onClick={() => handlePdfPageChange(currentPdfPage + 1)}
              disabled={currentPdfPage >= totalPdfPages}
              title="Next Page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="page-indicator">1 page</span>
        )}
      </div>
    </div>
  );
};
