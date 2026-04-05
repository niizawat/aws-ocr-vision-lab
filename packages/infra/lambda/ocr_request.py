"""OCR Request Lambda - Submit OCR jobs to SageMaker"""
import json
import os
import uuid
import base64
import boto3
from botocore.exceptions import ClientError
import db_utils

REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
BUCKET_NAME = os.environ["BUCKET_NAME"]
ENDPOINT_NAME = os.environ["ENDPOINT_NAME"]

s3 = boto3.client("s3", region_name=REGION)
sagemaker = boto3.client("sagemaker-runtime", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
}

CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
}


def get_content_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    return CONTENT_TYPES.get(ext, "application/octet-stream")


def handler(event, context):
    print(f"OCR Request received: {json.dumps(event)}")

    try:
        if not event.get("body"):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "Request body is required"}),
            }

        body = json.loads(event["body"])
        image_base64 = body.get("image_base64")
        s3_key = body.get("s3_key")  # For large file uploads via presigned URL
        presigned_job_id = body.get("job_id")  # job_id from presigned URL response
        filename = body.get("filename")
        model = body.get("model", "paddleocr-vl")
        options = body.get("options", {})

        # Either image_base64 or s3_key is required
        if not filename or (not image_base64 and not s3_key):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "filename and (image_base64 or s3_key) are required"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        # Determine input key and job_id based on upload method
        if s3_key:
            # Validate s3_key belongs to this user's job folder
            if not s3_key.startswith(f"{user_id}/"):
                return {
                    "statusCode": 403,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"error": "Invalid s3_key"}),
                }
            # Use job_id from presigned URL response
            job_id = presigned_job_id or str(uuid.uuid4())
            input_key = s3_key
            print(f"Using pre-uploaded file: s3://{BUCKET_NAME}/{input_key}")
        else:
            # File sent as base64 - decode and upload
            job_id = str(uuid.uuid4())
            input_key = f"{user_id}/{job_id}/input/{filename}"
            image_buffer = base64.b64decode(image_base64)

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=input_key,
                Body=image_buffer,
                ContentType=get_content_type(filename),
            )
            print(f"Image uploaded to s3://{BUCKET_NAME}/{input_key}")

        output_key = f"{user_id}/{job_id}/output/result.json"

        # Prepare SageMaker input with model selection and metadata
        from datetime import datetime
        sagemaker_input = json.dumps({
            "s3_uri": f"s3://{BUCKET_NAME}/{input_key}",
            "output_key": output_key,
            "model": model,
            "model_options": options,
            "metadata": {
                "job_id": job_id,
                "filename": filename,
                "s3_key": input_key,
                "created_at": datetime.utcnow().isoformat() + "Z",
            }
        })

        # Upload inference input to S3
        inference_input_key = f"{user_id}/{job_id}/input/inference-input.json"
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=inference_input_key,
            Body=sagemaker_input,
            ContentType="application/json",
        )

        # Invoke SageMaker endpoint asynchronously
        invoke_response = sagemaker.invoke_endpoint_async(
            EndpointName=ENDPOINT_NAME,
            InputLocation=f"s3://{BUCKET_NAME}/{inference_input_key}",
            ContentType="application/json",
        )

        print(f"SageMaker invocation response: {invoke_response}")

        # Record job in DuckDB metadata
        db_utils.add_job(user_id, job_id, filename, input_key, model, options)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "job_id": job_id,
                "status": "processing",
                "output_key": output_key,
                "inference_id": invoke_response.get("InferenceId"),
            }),
        }

    except Exception as e:
        print(f"Error processing OCR request: {str(e)}")

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
            }),
        }
