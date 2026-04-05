"""Multi-Model OCR Inference Script for SageMaker

Supports:
- PP-OCRv5: General-purpose OCR with high accuracy
- PP-StructureV3: Document structure analysis with table detection
- PaddleOCR-VL: Vision-language model for complex documents

Extensibility: To add a new model, create a new class inheriting from BaseOCRModel
and register it in MODEL_REGISTRY.
"""
import os
import json
import html
import tempfile
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List
import boto3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
os.environ["PADDLEOCR_HOME"] = "/opt/ml/code/.paddleocr"


# ============================================================================
# Base Model Class - Extend this for new OCR models
# ============================================================================
class BaseOCRModel(ABC):
    """Abstract base class for OCR models. Extend this to add new models."""

    def __init__(self):
        self._model = None

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name identifier."""
        pass

    @abstractmethod
    def load(self, options: Dict[str, Any] = None) -> None:
        """Load the model with given options."""
        pass

    @abstractmethod
    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        """Run prediction on the image."""
        pass

    def format_output(self, results: List[Any], output_format: str = "markdown") -> Dict[str, Any]:
        """Format the prediction results. Override for custom formatting."""
        output = {"success": True, "format": output_format, "results": [], "content": ""}

        for res in results:
            if hasattr(res, "json"):
                res_json = res.json
                output["results"].append(res_json)
                res_data = res_json.get("res", res_json)
                parsing_list = res_data.get("parsing_res_list", [])

                for block in parsing_list:
                    block_content = block.get("block_content", "")
                    block_label = block.get("block_label", "text")

                    if output_format == "markdown":
                        if block_label == "doc_title":
                            output["content"] += f"# {block_content}\n\n"
                        elif block_label == "paragraph_title":
                            output["content"] += f"## {block_content}\n\n"
                        elif block_label == "table":
                            output["content"] += f"{block_content}\n\n"
                        else:
                            output["content"] += f"{block_content}\n\n"
                    elif output_format == "html":
                        safe_content = html.escape(block_content)
                        if block_label == "doc_title":
                            output["content"] += f"<h1>{safe_content}</h1>\n"
                        elif block_label == "paragraph_title":
                            output["content"] += f"<h2>{safe_content}</h2>\n"
                        elif block_label == "table":
                            output["content"] += f"{safe_content}\n"
                        else:
                            output["content"] += f"<p>{safe_content}</p>\n"

        return output


# ============================================================================
# Model Implementations
# ============================================================================
class PPOcrV5Model(BaseOCRModel):
    """PP-OCRv5: General-purpose OCR with high accuracy for text extraction."""

    def __init__(self):
        super().__init__()
        self._current_lang = None

    @property
    def model_name(self) -> str:
        return "pp-ocrv5"

    def load(self, options: Dict[str, Any] = None) -> None:
        opts = options or {}
        lang = opts.get("lang") or None  # Empty string becomes None (use PaddleOCR default)
        logger.info(f"Loading PP-OCRv5 model with lang={lang}...")
        from paddleocr import PaddleOCR

        ocr_kwargs = {
            "use_doc_orientation_classify": opts.get("use_doc_orientation_classify", False),
            "use_doc_unwarping": opts.get("use_doc_unwarping", False),
            "use_textline_orientation": opts.get("use_textline_orientation", False),
        }
        if lang:
            ocr_kwargs["lang"] = lang

        self._model = PaddleOCR(**ocr_kwargs)
        self._current_lang = lang
        logger.info(f"PP-OCRv5 model loaded successfully with lang={lang}")

    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        opts = options or {}
        requested_lang = opts.get("lang") or None  # Empty string becomes None
        # Reload model if language changed
        if self._model is None or self._current_lang != requested_lang:
            self.load(options)
        return self._model.predict(input=image_path)

    def format_output(self, results: List[Any], output_format: str = "markdown") -> Dict[str, Any]:
        """Format PaddleOCR results to standard output format."""
        output = {"success": True, "format": output_format, "results": [], "content": ""}

        for res in results:
            if hasattr(res, "json"):
                res_data = res.json.get("res", {})
                rec_texts = res_data.get("rec_texts", [])
                rec_boxes = res_data.get("rec_boxes", [])

                output["results"].append(res.json)
                output["content"] = "\n".join(rec_texts)

        return output


class PPStructureV3Model(BaseOCRModel):
    """PP-StructureV3: Document structure analysis with table and layout detection."""

    def __init__(self):
        super().__init__()
        self._current_lang = None

    @property
    def model_name(self) -> str:
        return "pp-structurev3"

    def load(self, options: Dict[str, Any] = None) -> None:
        opts = options or {}
        lang = opts.get("lang") or None  # Empty string becomes None (use PaddleOCR default)
        logger.info(f"Loading PP-StructureV3 model with lang={lang}...")
        from paddleocr import PPStructureV3

        ocr_kwargs = {
            "use_doc_orientation_classify": opts.get("use_doc_orientation_classify", False),
            "use_doc_unwarping": opts.get("use_doc_unwarping", False),
        }
        if lang:
            ocr_kwargs["lang"] = lang

        self._model = PPStructureV3(**ocr_kwargs)
        self._current_lang = lang
        logger.info(f"PP-StructureV3 model loaded successfully with lang={lang}")

    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        opts = options or {}
        requested_lang = opts.get("lang") or None  # Empty string becomes None
        # Reload model if language changed
        if self._model is None or self._current_lang != requested_lang:
            self.load(options)
        return self._model.predict(input=image_path)

    def format_output(self, results: List[Any], output_format: str = "markdown") -> Dict[str, Any]:
        """Format PPStructureV3 results to standard output format."""
        output = {"success": True, "format": output_format, "results": [], "content": ""}

        for res in results:
            if hasattr(res, "json"):
                output["results"].append(res.json)
                # Use markdown output from res if available
                res_data = res.json.get("res", {})
                parsing_list = res_data.get("parsing_res_list", [])

                content_parts = []
                for block in parsing_list:
                    block_content = block.get("block_content", "")
                    block_label = block.get("block_label", "text")

                    if output_format == "markdown":
                        if block_label == "doc_title":
                            content_parts.append(f"# {block_content}")
                        elif block_label == "paragraph_title":
                            content_parts.append(f"## {block_content}")
                        else:
                            content_parts.append(block_content)
                    else:
                        content_parts.append(block_content)

                output["content"] = "\n\n".join(content_parts)

        return output


class PaddleOCRVLModel(BaseOCRModel):
    """PaddleOCR-VL: Vision-language model for complex document understanding."""

    @property
    def model_name(self) -> str:
        return "paddleocr-vl"

    def load(self, options: Dict[str, Any] = None) -> None:
        logger.info("Loading PaddleOCR-VL model...")
        from paddleocr import PaddleOCRVL
        self._model = PaddleOCRVL()
        logger.info("PaddleOCR-VL model loaded successfully")

    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        if self._model is None:
            self.load(options)
        return self._model.predict(input=image_path)


# ============================================================================
# Model Registry - Add new models here
# ============================================================================
MODEL_REGISTRY: Dict[str, type] = {
    "pp-ocrv5": PPOcrV5Model,
    "pp-structurev3": PPStructureV3Model,
    "paddleocr-vl": PaddleOCRVLModel,
}

# Cache for loaded models (lazy loading)
_model_cache: Dict[str, BaseOCRModel] = {}


def get_model(model_name: str) -> BaseOCRModel:
    """Get or create a model instance from the registry."""
    if model_name not in MODEL_REGISTRY:
        available = ", ".join(MODEL_REGISTRY.keys())
        raise ValueError(f"Unknown model: {model_name}. Available: {available}")

    if model_name not in _model_cache:
        logger.info(f"Creating new instance of {model_name}")
        _model_cache[model_name] = MODEL_REGISTRY[model_name]()

    return _model_cache[model_name]


# ============================================================================
# SageMaker Entry Points
# ============================================================================
s3_client = None


def model_fn(model_dir):
    """Initialize S3 client. Models are loaded lazily on first use."""
    global s3_client
    logger.info("Initializing OCR service...")
    s3_client = boto3.client("s3")
    logger.info("OCR service initialized. Models will be loaded on demand.")
    return {"initialized": True}


def input_fn(request_body, content_type):
    """Parse input JSON."""
    if content_type == "application/json":
        return json.loads(request_body)
    raise ValueError(f"Unsupported content type: {content_type}")


def predict_fn(input_data, _):
    """Main prediction function with model routing."""
    global s3_client

    # Extract input parameters
    s3_uri = input_data.get("s3_uri")
    output_key = input_data.get("output_key")
    model_name = input_data.get("model", "paddleocr-vl")
    model_options = input_data.get("model_options", {})
    metadata = input_data.get("metadata", {})

    if not s3_uri:
        raise ValueError("s3_uri is required")

    logger.info(f"Processing with model: {model_name}, options: {model_options}")

    # Parse S3 URI
    s3_uri_clean = s3_uri.replace("s3://", "")
    bucket = s3_uri_clean.split("/")[0]
    key = "/".join(s3_uri_clean.split("/")[1:])

    # Download image to temp file
    suffix = os.path.splitext(key)[1] or ".jpg"
    tmp_path = None
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        s3_client.download_file(bucket, key, tmp.name)
        tmp_path = tmp.name

    try:
        # Get model and run prediction
        ocr_model = get_model(model_name)
        results = ocr_model.predict(tmp_path, model_options)

        # Format output
        output = ocr_model.format_output(results, output_format="markdown")

        # Add metadata and model info to output
        output["model"] = model_name
        output["model_options"] = model_options
        output["metadata"] = metadata

        # Upload result to S3
        if output_key:
            s3_client.put_object(
                Bucket=bucket,
                Key=output_key,
                Body=json.dumps(output, ensure_ascii=False),
                ContentType="application/json"
            )
            logger.info(f"Result uploaded to s3://{bucket}/{output_key}")

        return output

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        error_output = {"success": False, "error": str(e), "model": model_name}
        if output_key:
            error_key = output_key.replace("result.json", "error.json")
            s3_client.put_object(
                Bucket=bucket,
                Key=error_key,
                Body=json.dumps(error_output, ensure_ascii=False),
                ContentType="application/json"
            )
        raise

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def output_fn(prediction, accept):
    """Format output response."""
    return json.dumps(prediction, ensure_ascii=False)
