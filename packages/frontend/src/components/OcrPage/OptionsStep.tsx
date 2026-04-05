import React from 'react';
import { CheckIcon, PlayIcon } from './Icons';
import {
  OcrModel,
  OcrLanguage,
  ModelOptions,
  MODEL_INFO,
  PP_OCRV5_OPTION_INFO,
  PP_STRUCTUREV3_OPTION_INFO,
  SUPPORTED_LANGUAGES,
} from '../../types/ocr';

export interface OptionsStepProps {
  previewUrl: string | null;
  imageFilename: string | undefined;
  selectedModel: OcrModel;
  modelOptions: ModelOptions;
  isProcessing: boolean;
  handleModelChange: (model: OcrModel) => void;
  handleOptionToggle: (key: string) => void;
  setModelOptions: React.Dispatch<React.SetStateAction<ModelOptions>>;
  handleSubmit: () => void;
  onBack: () => void;
}

export const OptionsStep: React.FC<OptionsStepProps> = ({
  previewUrl,
  imageFilename,
  selectedModel,
  modelOptions,
  isProcessing,
  handleModelChange,
  handleOptionToggle,
  setModelOptions,
  handleSubmit,
  onBack,
}) => {
  const optionInfo =
    selectedModel === 'pp-ocrv5'
      ? PP_OCRV5_OPTION_INFO
      : selectedModel === 'pp-structurev3'
        ? PP_STRUCTUREV3_OPTION_INFO
        : [];

  return (
    <div className="page-container">
      <div className="result-top-bar">
        <div className="result-top-bar-left">
          <span className="result-top-bar-model">{imageFilename}</span>
        </div>
        <div className="result-top-bar-right">
          <button className="btn btn-sm btn-outline" onClick={onBack}>
            Change Document
          </button>
        </div>
      </div>
      <div className="options-panel">
        {/* Image Preview */}
        <div className="options-preview">
          <div className="preview-container">
            {previewUrl && (
              <img src={previewUrl} alt="Preview" className="preview-image" />
            )}
          </div>
        </div>

        {/* Options Config */}
        <div className="options-config">
          {/* Model Selection */}
          <div className="option-section">
            <div className="option-label">Select Model</div>
            <div className="model-cards">
              {(Object.keys(MODEL_INFO) as OcrModel[]).map((model) => (
                <div
                  key={model}
                  className={`model-card ${selectedModel === model ? 'selected' : ''}`}
                  onClick={() => handleModelChange(model)}
                >
                  <div className="model-card-header">
                    <span className="model-card-title">
                      {MODEL_INFO[model].title}
                    </span>
                    <span className="model-card-radio" />
                  </div>
                  <div className="model-card-desc">
                    {MODEL_INFO[model].description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Language Selection - only for PP-OCRv5 and PP-StructureV3 */}
          {(selectedModel === 'pp-ocrv5' ||
            selectedModel === 'pp-structurev3') && (
            <div className="option-section">
              <div className="option-label">Language</div>
              <select
                className="lang-select"
                value={
                  (modelOptions as { lang?: OcrLanguage | '' }).lang ?? ''
                }
                onChange={(e) => {
                  setModelOptions({
                    ...(modelOptions as Record<string, unknown>),
                    lang: e.target.value as OcrLanguage | '',
                  } as typeof modelOptions);
                }}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Model-specific Options */}
          {optionInfo.length > 0 && (
            <div className="option-section">
              <div className="option-label">Options</div>
              <div className="toggle-options">
                {optionInfo.map((opt) => {
                  const isChecked =
                    (modelOptions as Record<string, boolean>)[opt.key] ||
                    false;
                  return (
                    <div
                      key={opt.key}
                      className={`toggle-option ${isChecked ? 'checked' : ''}`}
                      onClick={() => handleOptionToggle(opt.key)}
                    >
                      <div className="toggle-checkbox">
                        {isChecked && <CheckIcon />}
                      </div>
                      <div className="toggle-content">
                        <div className="toggle-title">{opt.title}</div>
                        <div className="toggle-desc">{opt.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Process Button */}
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>Processing...</>
              ) : (
                <>
                  <PlayIcon /> Process Document
                </>
              )}
            </button>
            <p
              style={{
                fontSize: '12px',
                color: '#666',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              Note: First request may be slower due to model initialization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
