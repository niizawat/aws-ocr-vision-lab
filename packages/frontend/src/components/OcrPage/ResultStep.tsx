import React from 'react';
import { ImagePanel } from './ImagePanel';
import { BlocksView } from './BlocksView';
import { V5BlocksView } from './V5BlocksView';
import { MarkdownView } from './MarkdownView';
import { JsonView } from './JsonView';
import { DocumentView } from './DocumentView';
import {
  OcrBlock,
  OcrJob,
  OcrResultData,
  OcrV5ResultData,
  OcrStructureResultData,
  ResultViewTab,
  MODEL_INFO,
  SUPPORTED_LANGUAGES,
  isOcrV5Result,
  isStructureResult,
} from '../../types/ocr';

export interface ResultStepProps {
  resultData: OcrResultData;
  resultTab: ResultViewTab;
  setResultTab: (tab: ResultViewTab) => void;
  hoveredBlockId: number | null;
  setHoveredBlockId: (id: number | null) => void;
  setSelectedBlock: (block: OcrBlock | null) => void;
  // Image panel props
  previewUrl: string | null;
  loadedImageUrl: string | null;
  resultImageRef: React.RefObject<HTMLImageElement | null>;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
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
  handleRetry: () => void;
  handleNewDocument: () => void;
  currentPdfPage: number;
  totalPdfPages: number;
  handlePdfPageChange: (page: number) => void;
  canRetry: boolean;
  setLoadedImageUrl: (url: string | null) => void;
  // Current job info
  currentJob: OcrJob | undefined;
  jobs: OcrJob[];
  processingJobId: string | null;
  // Markdown
  isMarkdownEditMode: boolean;
  setIsMarkdownEditMode: (mode: boolean) => void;
  updateJob: (id: string, updates: Partial<OcrJob>) => void;
  copyToClipboard: (text: string) => void;
  // Document view
  croppedImagesMap: Map<number, string>;
  croppedImagesReady: boolean;
  setCroppedImagesMap: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  setCroppedImagesReady: React.Dispatch<React.SetStateAction<boolean>>;
  lastProcessedBlocksRef: React.MutableRefObject<string>;
}

export const ResultStep: React.FC<ResultStepProps> = ({
  resultData,
  resultTab,
  setResultTab,
  hoveredBlockId,
  setHoveredBlockId,
  setSelectedBlock,
  previewUrl,
  loadedImageUrl,
  resultImageRef,
  imageContainerRef,
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
  handleRetry,
  handleNewDocument,
  currentPdfPage,
  totalPdfPages,
  handlePdfPageChange,
  canRetry,
  setLoadedImageUrl,
  currentJob,
  jobs,
  processingJobId,
  isMarkdownEditMode,
  setIsMarkdownEditMode,
  updateJob,
  copyToClipboard,
  croppedImagesMap,
  croppedImagesReady,
  setCroppedImagesMap,
  setCroppedImagesReady,
  lastProcessedBlocksRef,
}) => {
  const isV5Format = isOcrV5Result(resultData);
  const blocks = isStructureResult(resultData)
    ? resultData.parsing_res_list
    : [];
  const v5Data = isV5Format ? (resultData as OcrV5ResultData) : null;
  const structData = isStructureResult(resultData) ? resultData : null;

  const job = currentJob || jobs.find((j) => j.id === processingJobId);
  const filename = job?.filename || 'document';

  return (
    <div className="page-container">
      <div className="result-top-bar">
        <div className="result-top-bar-left">
          {job && (() => {
            const modelInfo = MODEL_INFO[job.model];
            return (
              <span className="result-top-bar-model">
                {modelInfo?.title || job.model}
                {job.processingTimeMs && (
                  <span className="result-top-bar-time">
                    {job.processingTimeMs >= 1000
                      ? `${(job.processingTimeMs / 1000).toFixed(1)}s`
                      : `${job.processingTimeMs}ms`}
                  </span>
                )}
              </span>
            );
          })()}
        </div>
        <div className="result-top-bar-right">
          <button
            className="btn btn-sm btn-outline"
            onClick={handleRetry}
            disabled={!canRetry}
            title="Retry with different options"
          >
            Retry
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleNewDocument}
          >
            New Document
          </button>
        </div>
      </div>
      <div className="result-panel">
        {/* Image Panel */}
        <ImagePanel
          previewUrl={previewUrl}
          loadedImageUrl={loadedImageUrl}
          resultImageRef={resultImageRef}
          imageContainerRef={imageContainerRef}
          resultData={resultData}
          hoveredBlockId={hoveredBlockId}
          showBbox={showBbox}
          setShowBbox={setShowBbox}
          zoomLevel={zoomLevel}
          panPosition={panPosition}
          isPanning={isPanning}
          handleZoomIn={handleZoomIn}
          handleZoomOut={handleZoomOut}
          handleZoomFit={handleZoomFit}
          handleWheel={handleWheel}
          handleMouseDown={handleMouseDown}
          currentPdfPage={currentPdfPage}
          totalPdfPages={totalPdfPages}
          handlePdfPageChange={handlePdfPageChange}
          setLoadedImageUrl={setLoadedImageUrl}
        />

        {/* Content Panel */}
        <div className="result-content-panel">
          <div className="result-tabs">
            {(
              ['blocks', 'json', 'markdown', 'document'] as ResultViewTab[]
            ).map((tab) => (
              <button
                key={tab}
                className={`result-tab ${resultTab === tab ? 'active' : ''}`}
                onClick={() => setResultTab(tab)}
              >
                {tab === 'blocks'
                  ? 'Blocks'
                  : tab === 'document'
                    ? 'Document'
                    : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="result-content">
            {resultTab === 'blocks' &&
              (isV5Format && v5Data ? (
                <V5BlocksView
                  data={v5Data}
                  hoveredBlockId={hoveredBlockId}
                  setHoveredBlockId={setHoveredBlockId}
                  setSelectedBlock={setSelectedBlock}
                />
              ) : (
                <BlocksView
                  blocks={blocks}
                  hoveredBlockId={hoveredBlockId}
                  setHoveredBlockId={setHoveredBlockId}
                  setSelectedBlock={setSelectedBlock}
                  croppedImagesMap={croppedImagesMap}
                />
              ))}
            {resultTab === 'json' && (
              <JsonView
                data={resultData}
                filename={filename}
                copyToClipboard={copyToClipboard}
              />
            )}
            {resultTab === 'markdown' && (
              <MarkdownView
                blocks={isV5Format ? null : blocks}
                v5Data={v5Data}
                job={job}
                currentPdfPage={currentPdfPage}
                isMarkdownEditMode={isMarkdownEditMode}
                setIsMarkdownEditMode={setIsMarkdownEditMode}
                updateJob={updateJob}
                copyToClipboard={copyToClipboard}
              />
            )}
            {resultTab === 'document' && (
              <DocumentView
                blocks={isV5Format ? null : blocks}
                structData={structData}
                v5Data={v5Data}
                job={job}
                currentPdfPage={currentPdfPage}
                updateJob={updateJob}
                croppedImagesMap={croppedImagesMap}
                croppedImagesReady={croppedImagesReady}
                setCroppedImagesMap={setCroppedImagesMap}
                setCroppedImagesReady={setCroppedImagesReady}
                lastProcessedBlocksRef={lastProcessedBlocksRef}
                loadedImageUrl={loadedImageUrl}
                previewUrl={previewUrl}
                resultImageRef={resultImageRef}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
