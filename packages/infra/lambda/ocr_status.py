"""OCR Status Lambda - Check job status from S3"""
import json
import os
import boto3
from botocore.exceptions import ClientError
import db_utils

REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
}


def handler(event, context):
    print(f"OCR Status request received: {json.dumps(event)}")

    try:
        path_params = event.get("pathParameters", {}) or {}
        job_id = path_params.get("jobId")

        if not job_id:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "jobId is required"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        output_key = f"{user_id}/{job_id}/output/result.json"
        failure_key = f"{user_id}/{job_id}/output/error.json"

        # Check if result exists
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=output_key)

            # Result exists, read it
            response = s3.get_object(Bucket=BUCKET_NAME, Key=output_key)
            result_str = response["Body"].read().decode("utf-8")
            result = json.loads(result_str)

            # Update job status in DuckDB metadata
            db_utils.update_job_status(user_id, job_id, "completed")

            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({
                    "status": "completed",
                    "result": result,
                }),
            }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")

            if error_code not in ("404", "NoSuchKey", "NotFound"):
                print(f"Unexpected S3 error: {error_code} - {e}")
                return {
                    "statusCode": 500,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"error": "Internal server error"}),
                }

            # Result not found - check for failure
            try:
                s3.head_object(Bucket=BUCKET_NAME, Key=failure_key)

                failure_response = s3.get_object(Bucket=BUCKET_NAME, Key=failure_key)
                failure_str = failure_response["Body"].read().decode("utf-8")
                failure_result = json.loads(failure_str)

                # Update job status in DuckDB metadata
                db_utils.update_job_status(user_id, job_id, "failed")

                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({
                        "status": "failed",
                        "error": failure_result.get("message", "OCR processing failed"),
                    }),
                }

            except ClientError:
                # No failure file either, still processing
                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"status": "processing"}),
                }

    except Exception as e:
        print(f"Error checking OCR status: {str(e)}")

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
            }),
        }
