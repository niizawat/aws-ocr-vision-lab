"""
Lambda function for managing S3 images.
- GET: Generate presigned URL for reading images
- DELETE: Remove S3 objects (input image + output folder)
"""

import json
import os
import unicodedata
from urllib.parse import unquote
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import db_utils

BUCKET_NAME = os.environ.get('BUCKET_NAME')
REGION = os.environ.get('REGION') or os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')

s3_client = boto3.client(
    's3',
    region_name=REGION,
    endpoint_url=f'https://s3.{REGION}.amazonaws.com',
    config=Config(signature_version='s3v4')
)


def handler(event, context):
    """Handle image management requests."""
    http_method = event.get('httpMethod', 'GET')

    if http_method == 'GET':
        return handle_get(event)
    elif http_method == 'DELETE':
        return handle_delete(event)
    else:
        return error_response(405, f'Method {http_method} not allowed')


def validate_s3_key(s3_key):
    """Validate s3_key to prevent path traversal."""
    if '..' in s3_key or s3_key.startswith('/'):
        return False
    return True


def handle_get(event):
    """Generate presigned URL for reading an image from S3."""
    try:
        # Get s3_key from path parameters
        path_params = event.get('pathParameters', {}) or {}
        s3_key = path_params.get('proxy', '')

        if not s3_key:
            return error_response(400, 'Missing s3_key')

        # URL decode and normalize Unicode (handle Korean filenames)
        s3_key = unquote(s3_key)

        if not validate_s3_key(s3_key):
            return error_response(403, 'Invalid s3_key')

        s3_key_nfc = unicodedata.normalize('NFC', s3_key)
        s3_key_nfd = unicodedata.normalize('NFD', s3_key)

        print(f"Looking for s3_key: {s3_key}")

        # Check if object exists (try both NFC and NFD normalization)
        found_key = None
        for key_variant in [s3_key, s3_key_nfc, s3_key_nfd]:
            try:
                s3_client.head_object(Bucket=BUCKET_NAME, Key=key_variant)
                found_key = key_variant
                print(f"Found object with key: {key_variant}")
                break
            except ClientError as e:
                if e.response['Error']['Code'] != '404':
                    raise
                continue

        if not found_key:
            print(f"Object not found for any key variant")
            return error_response(404, 'Image not found')

        s3_key = found_key

        # Generate presigned URL for GET
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
            },
            ExpiresIn=3600,  # 1 hour
        )

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'url': presigned_url,
                's3_key': s3_key,
            })
        }

    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return error_response(500, 'Internal server error')


def handle_delete(event):
    """Delete S3 objects (input image + output folder)."""
    try:
        # Get s3_key from path parameters
        path_params = event.get('pathParameters', {}) or {}
        s3_key = path_params.get('proxy', '')

        if not s3_key:
            return error_response(400, 'Missing s3_key')

        # URL decode and normalize Unicode (handle Korean filenames)
        s3_key = unquote(s3_key)

        if not validate_s3_key(s3_key):
            return error_response(403, 'Invalid s3_key')

        s3_key_nfc = unicodedata.normalize('NFC', s3_key)
        s3_key_nfd = unicodedata.normalize('NFD', s3_key)

        # Get job_id from query parameters
        query_params = event.get('queryStringParameters', {}) or {}
        job_id = query_params.get('job_id', '')

        # Get user_id from Cognito claims
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', '')

        deleted_objects = []

        # Delete the input image (try all normalization variants)
        for key_variant in [s3_key, s3_key_nfc, s3_key_nfd]:
            try:
                s3_client.head_object(Bucket=BUCKET_NAME, Key=key_variant)
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=key_variant)
                deleted_objects.append(key_variant)
                break
            except ClientError as e:
                if e.response['Error']['Code'] != '404':
                    print(f"Error deleting input image {key_variant}: {e}")

        # Delete entire job folder if job_id and user_id are available
        if job_id and user_id:
            output_prefix = f"{user_id}/{job_id}/"
            try:
                paginator = s3_client.get_paginator('list_objects_v2')
                for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=output_prefix):
                    for obj in page.get('Contents', []):
                        s3_client.delete_object(Bucket=BUCKET_NAME, Key=obj['Key'])
                        deleted_objects.append(obj['Key'])
            except Exception as e:
                print(f"Error deleting job folder {output_prefix}: {e}")

            # Remove job from DuckDB metadata
            try:
                db_utils.delete_job(user_id, job_id)
            except Exception as e:
                print(f"Error deleting job metadata: {e}")

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'deleted': deleted_objects,
                'message': f'Deleted {len(deleted_objects)} objects'
            })
        }

    except Exception as e:
        print(f"Error deleting S3 objects: {e}")
        return error_response(500, 'Internal server error')


def cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
    }


def error_response(status_code, message):
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps({'error': message})
    }
