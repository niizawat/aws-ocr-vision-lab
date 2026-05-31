"""Build Trigger Lambda - on_event handler

Starts CodeBuild project. Used by CDK Custom Resource Provider (onEventHandler).
"""
import boto3


def handler(event, context):
    """Handle Custom Resource events - start build only."""
    print(f"Event: {event}")

    request_type = event['RequestType']

    if request_type == 'Delete':
        return {'Data': {}}

    project_name = event['ResourceProperties']['ProjectName']
    codebuild = boto3.client('codebuild')

    print(f"Starting build for project: {project_name}")
    response = codebuild.start_build(projectName=project_name)
    build_id = response['build']['id']
    print(f"Build started: {build_id}")

    return {'Data': {'BuildId': build_id}}
