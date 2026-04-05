import React, {
  useState,
  useCallback,
  useRef,
  useContext,
  useEffect,
} from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import { useOcrApi } from '../hooks/useOcrApi';
import { renderPdfToImage } from '../utils/pdfUtils';
import { generateCroppedImages } from '../utils/ocrHelpers';

import { AppLayoutContext } from '../components/AppLayout';
import { UploadStep } from '../components/OcrPage/UploadStep';
import { OptionsStep } from '../components/OcrPage/OptionsStep';
import { ResultStep } from '../components/OcrPage/ResultStep';
import { BlockPreviewModal } from '../components/OcrPage/BlockPreviewModal';

import {
  OcrModel,
  OcrJob,
  OcrBlock,
  OcrResultData,
  OcrStructureResultData,
  ResultViewTab,
  ModelOptions,
  getDefaultOptionsForModel,
  isOcrV5Result,
  isStructureResult,
} from '../types/ocr';

export const Route = createFileRoute('/')({
  component: OcrPage,
});

type Step = 'upload' | 'options' | 'result';

function OcrPage() {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const {
    jobs,
    setJobs,
    addJob,
    updateJob,
    replaceJobId,
    currentJobId,
    setCurrentJobId,
    setOnNewJob,
    setOnDeleteS3Files,
  } = useContext(AppLayoutContext);

  // API URL for convenience
  const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

  // API hooks
  const { fetchJobs, deleteS3Files, fetchS3ImageUrl, fetchJobResult } = useOcrApi();

  // Fetch jobs on mount when authenticated
  useEffect(() => {
    if (auth.isAuthenticated && apiUrl) {
      fetchJobs().then((fetchedJobs) => {
        setJobs(fetchedJobs);
      });
    }
  }, [auth.isAuthenticated, apiUrl, fetchJobs, setJobs]);

  // Set delete S3 files handler for AppLayout
  useEffect(() => {
    setOnDeleteS3Files(deleteS3Files);
  }, [deleteS3Files, setOnDeleteS3Files]);

  // UI State
  const [step, setStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);

  // File State
  const [imageData, setImageData] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF Page State
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [totalPdfPages, setTotalPdfPages] = useState(1);
  const pdfArrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Options State
  const [selectedModel, setSelectedModel] = useState<OcrModel>('paddleocr-vl');
  const [modelOptions, setModelOptions] = useState<ModelOptions>(
    getDefaultOptionsForModel('paddleocr-vl'),
  );

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);

  // Result State
  const [resultTab, setResultTab] = useState<ResultViewTab>('blocks');
  const [hoveredBlockId, setHoveredBlockId] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<OcrBlock | null>(null);
  const [selectedBlockImage, setSelectedBlockImage] = useState<string | null>(
    null,
  );
  const [isMarkdownEditMode, setIsMarkdownEditMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showBbox, setShowBbox] = useState(true);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const resultImageRef = useRef<HTMLImageElement>(null);

  // State for cropped images
  const [croppedImagesMap, setCroppedImagesMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [croppedImagesReady, setCroppedImagesReady] = useState(false);
  const lastProcessedBlocksRef = useRef<string>('');

  // Current job (from history)
  const currentJob = jobs.find((j) => j.id === currentJobId);

  // Reset loadedImageUrl and cropped images when previewUrl changes
  useEffect(() => {
    setLoadedImageUrl(null);
    setCroppedImagesMap(new Map());
    setCroppedImagesReady(false);
    lastProcessedBlocksRef.current = '';
    // For data URLs, the image might already be complete, so check after a tick
    if (previewUrl?.startsWith('data:')) {
      const checkComplete = () => {
        if (resultImageRef.current?.complete && resultImageRef.current.naturalWidth > 0) {
          setLoadedImageUrl(previewUrl);
        }
      };
      // Check immediately and after a short delay
      requestAnimationFrame(checkComplete);
    }
  }, [previewUrl]);

  // Reset to upload when "New Document" is clicked
  useEffect(() => {
    setOnNewJob(() => {
      setStep('upload');
      setImageData(null);
      setPreviewUrl(null);
      setSelectedModel('paddleocr-vl');
      setModelOptions(getDefaultOptionsForModel('paddleocr-vl'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch to result view when viewing a job from history
  useEffect(() => {
    if (currentJob) {
      // Immediately clear previous state so nothing stale is shown
      setPreviewUrl(null);
      setLoadedImageUrl(null);

      // Load image from S3
      if (currentJob.s3Key) {
        (async () => {
          const imageUrl = await fetchS3ImageUrl(currentJob.s3Key!);
          if (!imageUrl) {
            // Image not found in S3, mark as unavailable
            updateJob(currentJob.id, { imageAvailable: false });
            setPreviewUrl(null);
            return;
          }
          // Mark as available
          if (currentJob.imageAvailable !== true) {
            updateJob(currentJob.id, { imageAvailable: true });
          }

          // Check if it's a PDF - render first page to image
          if (currentJob.filename.toLowerCase().endsWith('.pdf')) {
            try {
              const response = await fetch(imageUrl);
              const arrayBuffer = await response.arrayBuffer();
              pdfArrayBufferRef.current = arrayBuffer;
              const { dataUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
              setTotalPdfPages(totalPages);
              setCurrentPdfPage(1);
              if (dataUrl) {
                setPreviewUrl(dataUrl);
              } else {
                setPreviewUrl(null);
              }
            } catch (error) {
              console.error('Failed to render PDF:', error);
              setPreviewUrl(null);
            }
          } else {
            pdfArrayBufferRef.current = null;
            setTotalPdfPages(1);
            setCurrentPdfPage(1);
            setPreviewUrl(imageUrl);
          }
        })();
      }

      // Fetch result from S3 if not already loaded
      if (!currentJob.result && currentJob.status === 'completed') {
        (async () => {
          const result = await fetchJobResult(currentJob.id);
          if (result) {
            updateJob(currentJob.id, { result });
            setStep('result');
          }
        })();
      } else if (currentJob.result) {
        // Switch to result view if job has result
        setStep('result');
      }

      // Reset zoom and pan when switching jobs
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
      // Reset edit mode when switching jobs
      setIsMarkdownEditMode(false);
      // Reset cropped images when switching jobs
      setCroppedImagesMap(new Map());
      setCroppedImagesReady(false);
      lastProcessedBlocksRef.current = '';
    }
  }, [currentJobId, currentJob?.s3Key, currentJob?.status, currentJob?.result, fetchS3ImageUrl, fetchJobResult, updateJob]);

  // Ensure previewUrl is set when step changes to result
  useEffect(() => {
    if (step === 'result' && !previewUrl) {
      const job = currentJob || jobs.find((j) => j.id === processingJobId);
      if (!job?.s3Key) return;

      (async () => {
        const imageUrl = await fetchS3ImageUrl(job.s3Key!);
        if (!imageUrl) return;

        // Check if it's a PDF - render first page to image
        if (job.filename.toLowerCase().endsWith('.pdf')) {
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            pdfArrayBufferRef.current = arrayBuffer;
            const { dataUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
            setTotalPdfPages(totalPages);
            setCurrentPdfPage(1);
            if (dataUrl) {
              setPreviewUrl(dataUrl);
            }
          } catch (error) {
            console.error('Failed to render PDF:', error);
          }
        } else {
          pdfArrayBufferRef.current = null;
          setTotalPdfPages(1);
          setCurrentPdfPage(1);
          setPreviewUrl(imageUrl);
        }
      })();
    }
  }, [step, previewUrl, currentJob, jobs, processingJobId, fetchS3ImageUrl]);

  // Generate cropped image for selected block modal
  useEffect(() => {
    if (!selectedBlock) {
      setSelectedBlockImage(null);
      return;
    }

    // Use already loaded image from resultImageRef
    const img = resultImageRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) {
      setSelectedBlockImage(null);
      return;
    }

    // Get structure data for dimensions
    let structWidth = 0;
    let structHeight = 0;

    if (currentJob?.result?.results?.[0]) {
      const resultData = currentJob.result.results[0];
      if ('width' in resultData && 'height' in resultData) {
        const structData = resultData as OcrStructureResultData;
        structWidth = structData.width;
        structHeight = structData.height;
      }
    }

    try {
      const [x1, y1, x2, y2] = selectedBlock.block_bbox;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setSelectedBlockImage(null);
        return;
      }

      // Use structure data dimensions or fall back to natural image dimensions
      const baseWidth = structWidth || img.naturalWidth;
      const baseHeight = structHeight || img.naturalHeight;

      const scaleX = img.naturalWidth / baseWidth;
      const scaleY = img.naturalHeight / baseHeight;

      const cropX = Math.max(0, x1 * scaleX);
      const cropY = Math.max(0, y1 * scaleY);
      const cropW = Math.min((x2 - x1) * scaleX, img.naturalWidth - cropX);
      const cropH = Math.min((y2 - y1) * scaleY, img.naturalHeight - cropY);

      if (cropW <= 0 || cropH <= 0) {
        setSelectedBlockImage(null);
        return;
      }

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const dataUrl = canvas.toDataURL('image/png');
      setSelectedBlockImage(dataUrl);
    } catch (e) {
      console.error('Failed to crop image for preview:', e);
      setSelectedBlockImage(null);
    }
  }, [selectedBlock, currentJob]);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedBlock) {
        setSelectedBlock(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlock]);

  // Max file size: 100MB (using presigned URL for files > 5MB)
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  // File handling
  const handleFileSelect = useCallback(async (file: File) => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`,
      );
      return;
    }

    // Check if file is a PDF
    if (file.type === 'application/pdf') {
      try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Convert to base64 first (before ArrayBuffer gets detached)
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        uint8Array.forEach((byte) => {
          binaryString += String.fromCharCode(byte);
        });
        const base64 = btoa(binaryString);

        // Create a copy of the ArrayBuffer for PDF rendering
        const arrayBufferCopy = uint8Array.buffer.slice(0);

        // Render PDF first page to image for preview
        pdfArrayBufferRef.current = arrayBufferCopy;
        const { dataUrl: pdfPreviewUrl, totalPages } = await renderPdfToImage(arrayBufferCopy, 1);
        if (!pdfPreviewUrl) {
          alert('Failed to render PDF preview');
          return;
        }

        setTotalPdfPages(totalPages);
        setCurrentPdfPage(1);
        setImageData({ base64, filename: file.name });
        setPreviewUrl(pdfPreviewUrl);
        setStep('options');
      } catch (error) {
        console.error('Failed to process PDF:', error);
        alert('Failed to process PDF file');
      }
    } else {
      // Handle image files as before
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        setImageData({ base64, filename: file.name });
        setPreviewUrl(e.target?.result as string);
        setStep('options');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Supported file types
  const supportedTypes = [
    'image/png',
    'image/jpeg',
    'image/tiff',
    'application/pdf',
  ];

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && supportedTypes.includes(file.type)) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  // PDF page navigation
  const handlePdfPageChange = useCallback(async (newPage: number) => {
    if (!pdfArrayBufferRef.current || newPage < 1 || newPage > totalPdfPages) return;

    try {
      const { dataUrl } = await renderPdfToImage(pdfArrayBufferRef.current, newPage);
      if (dataUrl) {
        setCurrentPdfPage(newPage);
        setPreviewUrl(dataUrl);
        // Reset cropped images for new page
        setCroppedImagesMap(new Map());
        setCroppedImagesReady(false);
        lastProcessedBlocksRef.current = '';
      }
    } catch (error) {
      console.error('Error rendering PDF page:', error);
    }
  }, [totalPdfPages]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomLevel((prev) => Math.min(Math.max(prev + delta, 0.25), 3));
    }
  }, []);

  // Pan handlers - use document events to capture mouse release outside container
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Left click only
      e.preventDefault();
      setIsPanning(true);
      setDragStart({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y,
      });
    },
    [panPosition],
  );

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, dragStart]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  // Model selection
  const handleModelChange = useCallback((model: OcrModel) => {
    setSelectedModel(model);
    setModelOptions(getDefaultOptionsForModel(model));
  }, []);

  // Option toggle
  const handleOptionToggle = useCallback((key: string) => {
    setModelOptions(
      (prev) =>
        ({
          ...prev,
          [key]: !(prev as Record<string, boolean>)[key],
        }) as ModelOptions,
    );
  }, []);

  // Polling for job status
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;
      if (!apiUrl) return;

      try {
        const response = await fetch(`${apiUrl}/ocr/${jobId}`, {
          headers: {
            Authorization: auth.user?.id_token || '',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to get status');

        const data = await response.json();

        if (data.status === 'completed') {
          const processingTimeMs = jobStartTimeRef.current
            ? Date.now() - jobStartTimeRef.current
            : undefined;
          updateJob(jobId, {
            status: 'completed',
            result: data.result,
            processingTimeMs,
          });
          jobStartTimeRef.current = null;
          setIsProcessing(false);
          setProcessingJobId(null);
          setStep('result');
        } else if (data.status === 'failed') {
          updateJob(jobId, {
            status: 'failed',
          });
          jobStartTimeRef.current = null;
          setIsProcessing(false);
          setProcessingJobId(null);
          alert(data.error || 'Processing failed');
        } else {
          // Still processing, poll again (with cleanup support)
          pollTimeoutRef.current = setTimeout(() => pollJobStatus(jobId), 3000);
        }
      } catch (error) {
        console.error('Poll error:', error);
        pollTimeoutRef.current = setTimeout(() => pollJobStatus(jobId), 5000);
      }
    },
    [runtimeConfig, auth.user?.id_token, updateJob],
  );

  // Submit job - always upload to S3
  const handleSubmit = useCallback(async () => {
    if (!imageData) return;

    // Clear any existing poll before starting new job
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsProcessing(true);
    jobStartTimeRef.current = Date.now();

    const jobId = `job-${Date.now()}`;

    try {
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      // Always upload to S3 first
      const uploadResponse = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: imageData.filename,
          content_type: imageData.filename.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg',
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const uploadData = await uploadResponse.json();
      const { upload_url, s3_key, job_id: presignedJobId } = uploadData;

      // Convert base64 to binary and upload to S3
      const binaryString = atob(imageData.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const s3UploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: bytes,
        headers: {
          'Content-Type': imageData.filename.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg',
        },
      });

      if (!s3UploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // Create job with s3Key (not imageData)
      const newJob: OcrJob = {
        id: jobId,
        filename: imageData.filename,
        model: selectedModel,
        modelOptions: modelOptions,
        status: 'processing',
        createdAt: new Date(),
        s3Key: s3_key,
        imageAvailable: true,
      };

      addJob(newJob);

      // Submit OCR request with s3_key
      const response = await fetch(`${apiUrl}/ocr`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          s3_key: s3_key,
          job_id: presignedJobId,
          filename: imageData.filename,
          model: selectedModel,
          options: modelOptions,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const backendJobId = data.job_id;

      // Replace the local job ID with the backend job_id and update s3Key
      replaceJobId(jobId, backendJobId);
      updateJob(backendJobId, { s3Key: s3_key });
      setProcessingJobId(backendJobId);

      // Start polling
      pollJobStatus(backendJobId);
    } catch (err) {
      console.error('Submit error:', err);
      // If job was added, mark as failed
      updateJob(jobId, { status: 'failed' });
      setIsProcessing(false);
      alert('Failed to submit OCR request. Please try again.');
    }
  }, [
    imageData,
    selectedModel,
    modelOptions,
    auth.user?.id_token,
    apiUrl,
    addJob,
    updateJob,
    replaceJobId,
    pollJobStatus,
  ]);

  // Retry: Load image from S3 and go to preview step
  const handleRetry = useCallback(async () => {
    if (!currentJob?.s3Key) return;

    try {
      // Fetch presigned URL for the image
      const imageUrl = await fetchS3ImageUrl(currentJob.s3Key);
      if (!imageUrl) {
        alert('Failed to load image from S3');
        return;
      }

      // Fetch file from S3
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Check if it's a PDF
      const isPdf = currentJob.filename.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // For PDF: convert to base64 and render first page for preview
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binaryString);

        // Render PDF first page for preview
        pdfArrayBufferRef.current = arrayBuffer;
        const { dataUrl: pdfPreviewUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
        if (!pdfPreviewUrl) {
          alert('Failed to render PDF preview');
          return;
        }

        setTotalPdfPages(totalPages);
        setCurrentPdfPage(1);
        setImageData({ base64, filename: currentJob.filename });
        setPreviewUrl(pdfPreviewUrl);

        // Restore previous model and options
        setSelectedModel(currentJob.model);
        if (currentJob.modelOptions) {
          setModelOptions(currentJob.modelOptions);
        }

        setCurrentJobId(null);
        setStep('options');
      } else {
        // For images: use FileReader
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];

          setImageData({ base64, filename: currentJob.filename });
          setPreviewUrl(dataUrl);

          // Restore previous model and options
          setSelectedModel(currentJob.model);
          if (currentJob.modelOptions) {
            setModelOptions(currentJob.modelOptions);
          }

          setCurrentJobId(null);
          setStep('options');
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      console.error('Retry error:', err);
      alert('Failed to load image for retry');
    }
  }, [currentJob, fetchS3ImageUrl, setCurrentJobId]);

  // Get result data for current page
  const getResultData = (): OcrResultData | null => {
    // Try multiple ways to find the job
    let job = currentJob;
    if (!job && processingJobId) {
      job = jobs.find((j) => j.id === processingJobId);
    }
    if (!job && currentJobId) {
      job = jobs.find((j) => j.id === currentJobId);
    }

    if (!job?.result) return null;
    // Handle various response formats
    const result = job.result as {
      res?: OcrResultData;
      results?: Array<{ res?: OcrResultData } | OcrResultData>;
    };

    // Format with results array (multi-page or single)
    if (result.results && result.results.length > 0) {
      const pageIndex = currentPdfPage - 1;
      // Use page index if results have multiple pages, otherwise use first result
      const pageResult =
        result.results.length > 1
          ? result.results[pageIndex] || result.results[0]
          : result.results[0];
      const typedResult = pageResult as { res?: OcrResultData };
      if (typedResult.res) return typedResult.res;
      return pageResult as OcrResultData;
    }

    // Format: { res: {...} } (single result)
    if (result.res) return result.res;

    return null;
  };

  const resultData = getResultData();

  // Generate cropped images for BlocksView when in blocks tab
  useEffect(() => {
    if (resultTab !== 'blocks' || !resultData || isOcrV5Result(resultData)) return;
    if (!isStructureResult(resultData)) return;

    const structData = resultData as OcrStructureResultData;
    const blocks = structData.parsing_res_list;
    const imgElement = resultImageRef.current;
    const blocksKey = `${loadedImageUrl}:${blocks.map((b) => b.block_id).join(',')}`;
    const imageIsReady =
      imgElement &&
      imgElement.complete &&
      imgElement.naturalWidth > 0 &&
      loadedImageUrl === previewUrl;

    if (
      blocksKey !== lastProcessedBlocksRef.current &&
      imageIsReady &&
      structData?.width &&
      structData?.height
    ) {
      lastProcessedBlocksRef.current = blocksKey;
      try {
        const croppedMap = generateCroppedImages(blocks, structData, imgElement);
        if (croppedMap.size > 0) {
          setCroppedImagesMap(croppedMap);
        }
      } catch (error) {
        console.error('Failed to generate cropped images:', error);
      }
    }
  }, [resultTab, resultData, loadedImageUrl, previewUrl]);

  // Show toast helper
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // Copy to clipboard helper
  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied!');
      } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy');
      }
    },
    [showToast],
  );

  const handleBackToUpload = useCallback(() => {
    setStep('upload');
    setImageData(null);
    setPreviewUrl(null);
  }, []);

  const handleNewDocument = useCallback(() => {
    setStep('upload');
    setCurrentJobId(null);
  }, [setCurrentJobId]);

  // Toast component
  const renderToast = () =>
    toastMessage && <div className="toast">{toastMessage}</div>;

  // Processing overlay
  if (isProcessing) {
    return (
      <>
        {step === 'options' && (
          <OptionsStep
            previewUrl={previewUrl}
            imageFilename={imageData?.filename}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            isProcessing={isProcessing}
            handleModelChange={handleModelChange}
            handleOptionToggle={handleOptionToggle}
            setModelOptions={setModelOptions}
            handleSubmit={handleSubmit}
            onBack={handleBackToUpload}
          />
        )}
        <div className="processing-overlay">
          <div className="processing-spinner" />
          <div className="processing-text">Processing your document</div>
          <div className="processing-subtext">
            This may take a few moments...
          </div>
        </div>
        <BlockPreviewModal
          selectedBlock={selectedBlock}
          selectedBlockImage={selectedBlockImage}
          previewUrl={previewUrl}
          onClose={() => setSelectedBlock(null)}
        />
        {renderToast()}
      </>
    );
  }

  // Render based on step
  const renderContent = () => {
    switch (step) {
      case 'upload':
        return (
          <UploadStep
            fileInputRef={fileInputRef}
            handleFileInputChange={handleFileInputChange}
            isDragging={isDragging}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            selectedModel={selectedModel}
            handleModelChange={handleModelChange}
          />
        );
      case 'options':
        return (
          <OptionsStep
            previewUrl={previewUrl}
            imageFilename={imageData?.filename}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            isProcessing={isProcessing}
            handleModelChange={handleModelChange}
            handleOptionToggle={handleOptionToggle}
            setModelOptions={setModelOptions}
            handleSubmit={handleSubmit}
            onBack={handleBackToUpload}
          />
        );
      case 'result': {
        const imageLoading = !resultData || (!!previewUrl && loadedImageUrl !== previewUrl);
        return (
          <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
            {imageLoading && (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(4px)',
                color: '#999',
                fontSize: '15px',
              }}>
                <span style={{ color: '#aaa' }}>Loading...</span>
              </div>
            )}
            {resultData && <ResultStep
            resultData={resultData}
            resultTab={resultTab}
            setResultTab={setResultTab}
            hoveredBlockId={hoveredBlockId}
            setHoveredBlockId={setHoveredBlockId}
            setSelectedBlock={setSelectedBlock}
            previewUrl={previewUrl}
            loadedImageUrl={loadedImageUrl}
            resultImageRef={resultImageRef}
            imageContainerRef={imageContainerRef}
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
            handleRetry={handleRetry}
            handleNewDocument={handleNewDocument}
            currentPdfPage={currentPdfPage}
            totalPdfPages={totalPdfPages}
            handlePdfPageChange={handlePdfPageChange}
            canRetry={!!currentJob?.s3Key}
            setLoadedImageUrl={setLoadedImageUrl}
            currentJob={currentJob}
            jobs={jobs}
            processingJobId={processingJobId}
            isMarkdownEditMode={isMarkdownEditMode}
            setIsMarkdownEditMode={setIsMarkdownEditMode}
            updateJob={updateJob}
            copyToClipboard={copyToClipboard}
            croppedImagesMap={croppedImagesMap}
            croppedImagesReady={croppedImagesReady}
            setCroppedImagesMap={setCroppedImagesMap}
            setCroppedImagesReady={setCroppedImagesReady}
            lastProcessedBlocksRef={lastProcessedBlocksRef}
          />}
          </div>
        );
      }
      default:
        return (
          <UploadStep
            fileInputRef={fileInputRef}
            handleFileInputChange={handleFileInputChange}
            isDragging={isDragging}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            selectedModel={selectedModel}
            handleModelChange={handleModelChange}
          />
        );
    }
  };

  return (
    <>
      {renderContent()}
      <BlockPreviewModal
        selectedBlock={selectedBlock}
        selectedBlockImage={selectedBlockImage}
        previewUrl={previewUrl}
        onClose={() => setSelectedBlock(null)}
      />
      {renderToast()}
    </>
  );
}
