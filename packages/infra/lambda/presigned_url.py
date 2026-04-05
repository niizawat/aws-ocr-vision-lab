"""
Lambda function to generate S3 presigned URLs for file uploads.
Supports files up to 100MB.
"""

import json
import os
import uuid
import boto3
from botocore.config import Config

BUCKET_NAME = os.environ.get('BUCKET_NAME')
REGION = os.environ.get('REGION') or os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

s3_client = boto3.client(
    's3',
    region_name=REGION,
    endpoint_url=f'https://s3.{REGION}.amazonaws.com',
    config=Config(signature_version='s3v4')
)


def handler(event, context):
    """Generate presigned URL for S3 upload."""
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        filename = body.get('filename', 'upload')
        content_type = body.get('content_type', 'application/octet-stream')

        # Get user ID from Cognito claims
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', 'anonymous')

        # Generate job_id upfront so file goes directly into job folder
        job_id = str(uuid.uuid4())
        s3_key = f"{user_id}/{job_id}/input/{filename}"

        # Generate presigned URL for PUT
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=300,  # 5 minutes
        )

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            },
            'body': json.dumps({
                'upload_url': presigned_url,
                's3_key': s3_key,
                'job_id': job_id,
            })
        }

    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
