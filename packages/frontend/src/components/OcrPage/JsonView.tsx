import React from 'react';
import { OcrResultData } from '../../types/ocr';
import { downloadFile } from '../../utils/ocrHelpers';

export interface JsonViewProps {
  data: OcrResultData;
  filename: string;
  copyToClipboard: (text: string) => void;
}

export const JsonView: React.FC<JsonViewProps> = ({
  data,
  filename,
  copyToClipboard,
}) => {
  const baseName = filename.replace(/\.[^/.]+$/, '') || 'ocr_result';
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="view-with-toolbar">
      <div className="view-toolbar">
        <button
          className="btn btn-sm btn-outline"
          onClick={() => copyToClipboard(jsonString)}
        >
          Copy
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={() =>
            downloadFile(jsonString, `${baseName}.json`, 'application/json')
          }
        >
          Download
        </button>
      </div>
      <div className="json-view">
        <pre>{jsonString}</pre>
      </div>
    </div>
  );
};
