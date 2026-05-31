"""Build Trigger Lambda - is_complete handler

Checks CodeBuild status. Called periodically by Step Functions
via CDK Custom Resource Provider (isCompleteHandler).
"""
import boto3


def handler(event, context):
    """Check if CodeBuild has completed."""
    print(f"Event: {event}")

    if event['RequestType'] == 'Delete':
        return {'IsComplete': True}

    build_id = event['Data']['BuildId']
    codebuild = boto3.client('codebuild')

    builds = codebuild.batch_get_builds(ids=[build_id])
    build = builds['builds'][0]
    status = build['buildStatus']
    print(f"Build {build_id} status: {status}")

    if status == 'SUCCEEDED':
        return {'IsComplete': True, 'Data': {'BuildId': build_id, 'Status': status}}
    elif status in ['FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT']:
        raise Exception(f'CodeBuild failed with status: {status}')

    # Still in progress
    return {'IsComplete': False}
