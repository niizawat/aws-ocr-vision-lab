#!/bin/bash

echo ""
echo "==========================================================================="
echo "  OCR Vision Lab - Automated Deployment                                    "
echo "---------------------------------------------------------------------------"
echo "  This script will deploy the OCR Vision Lab using CloudShell             "
echo "  and CodeBuild for a seamless deployment experience.                      "
echo ""
echo "  Prerequisites:                                                           "
echo "     - AWS CLI configured with appropriate permissions                     "
echo "     - Valid email address for Cognito admin user                         "
echo ""
echo "  Features:                                                                "
echo "     - PaddleOCR models (PP-OCRv5, PP-StructureV3, PaddleOCR-VL)          "
echo "     - Cognito authentication                                              "
echo "     - SageMaker GPU inference (ml.g5.xlarge)                             "
echo "     - React frontend with CloudFront CDN                                  "
echo "==========================================================================="
echo ""

# Default parameters
REPO_URL="https://github.com/yunwoong7/aws-ocr-vision-lab.git"
VERSION="main"
INSTANCE_TYPE="ml.g5.xlarge"

# Function to prompt for email with validation
prompt_for_email() {
    while true; do
        read -p "Enter admin user email address: " ADMIN_USER_EMAIL
        if [[ "$ADMIN_USER_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            break
        else
            echo "Invalid email format. Please enter a valid email address."
        fi
    done
}

# Function to prompt for instance type
prompt_for_instance_type() {
    echo ""
    echo "Select SageMaker instance type:"
    echo "1) ml.g5.xlarge (default, ~\$1.41/hour)"
    echo "2) ml.g5.2xlarge (~\$2.82/hour)"
    echo "3) ml.g4dn.xlarge (~\$0.74/hour, older GPU)"
    read -p "Enter choice [1-3]: " choice
    case $choice in
        2) INSTANCE_TYPE="ml.g5.2xlarge" ;;
        3) INSTANCE_TYPE="ml.g4dn.xlarge" ;;
        *) INSTANCE_TYPE="ml.g5.xlarge" ;;
    esac
}

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --admin-email) ADMIN_USER_EMAIL="$2"; shift ;;
        --instance-type) INSTANCE_TYPE="$2"; shift ;;
        --repo-url) REPO_URL="$2"; shift ;;
        --version) VERSION="$2"; shift ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --admin-email EMAIL         Admin user email for Cognito"
            echo "  --instance-type TYPE        SageMaker instance type"
            echo "  --repo-url URL              Repository URL"
            echo "  --version VERSION           Branch or tag to deploy"
            echo "  --help                      Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Interactive prompts if not provided via arguments
if [[ -z "$ADMIN_USER_EMAIL" ]]; then
    prompt_for_email
fi

prompt_for_instance_type

# Display configuration
echo ""
echo "Configuration:"
echo "--------------"
echo "Admin Email: $ADMIN_USER_EMAIL"
echo "Instance Type: $INSTANCE_TYPE"
echo "Repository: $REPO_URL"
echo "Version: $VERSION"
echo ""

# Cost warning
echo "==========================================================================="
echo "  COST WARNING                                                             "
echo "---------------------------------------------------------------------------"
echo "  SageMaker Endpoint ($INSTANCE_TYPE) runs 24/7 once deployed.            "
echo "  Estimated cost: ~\$1,000+/month for ml.g5.xlarge                         "
echo ""
echo "  To stop costs, delete the endpoint when not in use:                      "
echo "  ./cleanup.sh --endpoint-only                                             "
echo "==========================================================================="
echo ""

# Confirm deployment
while true; do
    read -p "Do you want to proceed with deployment? (y/N): " answer
    case ${answer:0:1} in
        y|Y )
            echo "Starting deployment..."
            break
            ;;
        n|N )
            echo "Deployment cancelled."
            exit 0
            ;;
        * )
            echo "Please enter y or n."
            ;;
    esac
done

# Validate CloudFormation template
echo "Validating CloudFormation template..."
aws cloudformation validate-template --template-body file://deploy-codebuild.yml > /dev/null 2>&1
if [[ $? -ne 0 ]]; then
    echo "Template validation failed. Please ensure deploy-codebuild.yml exists and is valid."
    exit 1
fi

StackName="ocr-vision-lab-codebuild-deploy"

# Deploy CloudFormation stack
echo "Deploying CloudFormation stack for CodeBuild..."
aws cloudformation deploy \
  --stack-name $StackName \
  --template-file deploy-codebuild.yml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AdminUserEmail="$ADMIN_USER_EMAIL" \
    InstanceType="$INSTANCE_TYPE" \
    RepoUrl="$REPO_URL" \
    Version="$VERSION"

if [[ $? -ne 0 ]]; then
    echo "CloudFormation deployment failed"
    exit 1
fi

echo "Waiting for stack creation to complete..."
spin='-\|/'
i=0
while true; do
    status=$(aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].StackStatus' --output text 2>/dev/null)
    if [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]; then
        break
    elif [[ "$status" == "ROLLBACK_COMPLETE" || "$status" == "DELETE_FAILED" || "$status" == "CREATE_FAILED" || "$status" == "UPDATE_ROLLBACK_COMPLETE" ]]; then
        echo ""
        echo "Stack deployment failed with status: $status"
        exit 1
    fi
    printf "\r${spin:i++%${#spin}:1}"
    sleep 1
done
echo -e "\nStack deployed successfully\n"

# Get CodeBuild project name
outputs=$(aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs')
projectName=$(echo $outputs | jq -r '.[] | select(.OutputKey=="ProjectName").OutputValue')

if [[ -z "$projectName" ]]; then
    echo "Failed to retrieve CodeBuild project name"
    exit 1
fi

# Start CodeBuild
echo "Starting CodeBuild project: $projectName..."
buildId=$(aws codebuild start-build --project-name $projectName --query 'build.id' --output text)

if [[ -z "$buildId" ]]; then
    echo "Failed to start CodeBuild project"
    exit 1
fi

# Wait for build completion
echo "Build started. Waiting for completion..."
echo "You can monitor the build in the AWS Console: CodeBuild > Build projects > $projectName"
echo ""

while true; do
    buildStatus=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].buildStatus' --output text)
    phases=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].phases[?phaseStatus==`IN_PROGRESS`].phaseType' --output text)

    if [[ ! -z "$phases" ]]; then
        echo -ne "\rCurrent phase: $phases    "
    fi

    if [[ "$buildStatus" == "SUCCEEDED" || "$buildStatus" == "FAILED" || "$buildStatus" == "STOPPED" ]]; then
        echo ""
        break
    fi
    sleep 5
done

echo "Build completed with status: $buildStatus"

if [[ "$buildStatus" != "SUCCEEDED" ]]; then
    echo "Build failed. Fetching logs..."

    buildDetail=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].logs.{groupName: groupName, streamName: streamName}' --output json)
    logGroupName=$(echo $buildDetail | jq -r '.groupName')
    logStreamName=$(echo $buildDetail | jq -r '.streamName')

    if [[ ! -z "$logGroupName" ]] && [[ "$logGroupName" != "null" ]]; then
        echo "Fetching recent error logs..."
        aws logs tail $logGroupName --since 5m --filter-pattern "ERROR" 2>/dev/null || true
    fi

    echo ""
    echo "For full logs, run:"
    echo "aws logs tail $logGroupName --follow"
    exit 1
fi

# Get deployment results
echo ""
echo "==========================================================================="
echo "  Deployment Successful!                                                   "
echo "---------------------------------------------------------------------------"

buildDetail=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].logs.{groupName: groupName, streamName: streamName}' --output json)
logGroupName=$(echo $buildDetail | jq -r '.groupName')
logStreamName=$(echo $buildDetail | jq -r '.streamName')

# Get values directly from CloudFormation
frontendDomain=$(aws cloudformation describe-stacks --stack-name PaddleOCR-Frontend --query 'Stacks[0].Outputs[?contains(OutputKey,`DistributionDomainName`)].OutputValue' --output text 2>/dev/null)
frontendUrl="https://${frontendDomain}"

# Password is TempPass123! for new users
cognitoPassword="TempPass123!"

echo ""
echo "  Application URL: $frontendUrl"
echo ""
echo "  Login Credentials:"
echo "     Email: $ADMIN_USER_EMAIL"
echo "     Temporary Password: $cognitoPassword"
echo ""
echo "  Next Steps:"
echo "     1. Access the application using the URL above"
echo "     2. Log in with Cognito credentials"
echo "     3. Change your password when prompted"
echo "     4. Start uploading and analyzing documents"
echo ""
echo "  To delete all resources:"
echo "     ./cleanup.sh"
echo ""
echo "  To delete only SageMaker endpoint (stop costs):"
echo "     ./cleanup.sh --endpoint-only"
echo ""
echo "==========================================================================="

# Save deployment info
echo "{
  \"stackName\": \"$StackName\",
  \"projectName\": \"$projectName\",
  \"frontendUrl\": \"$frontendUrl\",
  \"instanceType\": \"$INSTANCE_TYPE\",
  \"adminEmail\": \"$ADMIN_USER_EMAIL\",
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}" > deployment-info.json

echo ""
echo "Deployment information saved to: deployment-info.json"
