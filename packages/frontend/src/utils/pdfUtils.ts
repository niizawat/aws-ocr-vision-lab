// PDF.js CDN version - loaded at runtime, not bundled
const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLibPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPdfJs(): Promise<any> {
  if (pdfjsLibPromise) return pdfjsLibPromise;

  pdfjsLibPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).pdfjsLib) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve((window as any).pdfjsLib);
      return;
    }

    const script = document.createElement('script');
    script.src = `${PDFJS_CDN}/pdf.min.mjs`;
    script.type = 'module';
    script.onload = () => {
      // Wait for the module to be available
      const checkLib = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).pdfjsLib) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lib = (window as any).pdfjsLib;
          lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
          resolve(lib);
        } else {
          setTimeout(checkLib, 50);
        }
      };
      checkLib();
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });

  return pdfjsLibPromise;
}

// Helper function to render PDF page to image
export async function renderPdfToImage(
  arrayBuffer: ArrayBuffer,
  pageNumber: number = 1,
): Promise<{ dataUrl: string | null; totalPages: number }> {
  try {
    // Load PDF.js from CDN
    const pdfjsLib = await loadPdfJs();

    // Make a copy of the ArrayBuffer to avoid "detached ArrayBuffer" error
    const arrayBufferCopy = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBufferCopy),
    });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    // Ensure page number is valid
    const validPageNum = Math.max(1, Math.min(pageNumber, totalPages));
    const page = await pdf.getPage(validPageNum);

    // Use a reasonable scale for preview (2x for good quality)
    const scale = 2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { dataUrl: null, totalPages };

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext as Parameters<typeof page.render>[0])
      .promise;

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), totalPages };
  } catch (error) {
    console.error('Failed to render PDF:', error);
    return { dataUrl: null, totalPages: 0 };
  }
}
