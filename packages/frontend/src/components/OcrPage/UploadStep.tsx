import React from 'react';
import { UploadIcon } from './Icons';
import {
  OcrModel,
  MODEL_INFO,
} from '../../types/ocr';

export interface UploadStepProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isDragging: boolean;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  selectedModel: OcrModel;
  handleModelChange: (model: OcrModel) => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({
  fileInputRef,
  handleFileInputChange,
  isDragging,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  selectedModel,
  handleModelChange,
}) => (
  <div
    className="page-container"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div style={{ maxWidth: '700px', width: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tiff,.tif,.pdf,image/png,image/jpeg,image/tiff,application/pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
      <div
        className={`upload-zone ${isDragging ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon />
        <div className="upload-zone-title">Drag and drop your file here</div>
        <div className="upload-zone-subtitle">
          or <span className="upload-zone-link">click to browse</span>
        </div>
        <div className="upload-zone-formats">
          <div className="formats-title">Supported formats</div>
          <div className="formats-list">
            <span className="format-tag">PNG</span>
            <span className="format-tag">JPEG</span>
            <span className="format-tag">TIFF</span>
            <span className="format-tag">PDF</span>
          </div>
          <div className="formats-limit">Maximum file size: 100MB</div>
        </div>
      </div>

      <p className="app-description">
        This is not a production solution — it's a playground for testing
        PaddleOCR models on AWS infrastructure. Explore and compare different
        OCR capabilities before implementing in your own projects.
      </p>

      {/* Model Selection */}
      <div className="model-selection-section">
        <div className="model-selection-label">Select OCR Model</div>
        <div className="model-cards-horizontal">
          {(Object.keys(MODEL_INFO) as OcrModel[]).map((model) => (
            <div
              key={model}
              className={`model-card-compact ${selectedModel === model ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleModelChange(model);
              }}
            >
              <div className="model-card-compact-radio" />
              <div className="model-card-compact-content">
                <span className="model-card-compact-title">
                  {MODEL_INFO[model].title}
                </span>
                <span className="model-card-compact-desc">
                  {MODEL_INFO[model].description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
