import {
  RemovalPolicy,
  Stack,
  CfnOutput,
  Duration,
  CustomResource,
} from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  Project,
  BuildSpec,
  LinuxBuildImage,
  ComputeType,
} from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Runtime, Function, Code } from 'aws-cdk-lib/aws-lambda';
import * as crypto from 'crypto';

export interface OcrImageBuilderProps {
  /**
   * Name of the ECR repository
   * @default 'paddleocr-vl'
   */
  repositoryName?: string;
  /**
   * Path to the build-trigger Lambda code (required)
   */
  buildTriggerLambdaPath: string;
}

// Dockerfile content - change this to trigger rebuild
// Note: BASE_IMAGE_REGION placeholder is replaced at build time with the actual region
const DOCKERFILE_CONTENT_TEMPLATE = `# PaddleOCR-VL Docker Image for AWS SageMaker
FROM 763104351884.dkr.ecr.{{REGION}}.amazonaws.com/pytorch-inference:2.2.0-gpu-py310-cu118-ubuntu20.04-sagemaker

WORKDIR /opt/ml/code
ENV PADDLEOCR_HOME=/opt/ml/code/.paddleocr
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    libgl1-mesa-glx \\
    libglib2.0-0 \\
    libsm6 \\
    libxext6 \\
    libxrender-dev \\
    && rm -rf /var/lib/apt/lists/*

# Install PaddlePaddle GPU
RUN pip install --upgrade pip && \\
    pip install paddlepaddle-gpu==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# Install PaddleOCR
RUN pip install "paddleocr[all]"

EXPOSE 8080`;

export class OcrImageBuilder extends Construct {
  public readonly repository: Repository;
  public readonly buildProject: Project;
  public readonly imageUri: string;
  public readonly buildTrigger: CustomResource;

  constructor(scope: Construct, id: string, props: OcrImageBuilderProps) {
    super(scope, id);

    const repositoryName = props.repositoryName || 'paddleocr-vl';
    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    // Replace region placeholder in Dockerfile template
    const dockerfileContent = DOCKERFILE_CONTENT_TEMPLATE.replace(
      '{{REGION}}',
      region,
    );

    // Calculate hash of Dockerfile for change detection
    const dockerfileHash = crypto
      .createHash('md5')
      .update(dockerfileContent)
      .digest('hex')
      .substring(0, 8);

    // ECR Repository
    this.repository = new Repository(this, 'Repository', {
      repositoryName,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });

    this.imageUri = `${this.repository.repositoryUri}:latest`;

    // CodeBuild Project for building Docker image only
    this.buildProject = new Project(this, 'BuildProject', {
      projectName: 'paddleocr-docker-builder',
      description: 'Builds PaddleOCR Docker image for SageMaker',
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.LARGE,
        privileged: true,
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${account}.dkr.ecr.${region}.amazonaws.com`,
              'echo Logging in to SageMaker ECR for base image...',
              `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin 763104351884.dkr.ecr.${region}.amazonaws.com`,
            ],
          },
          build: {
            commands: [
              'echo Building Docker image...',
              `cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfileContent}
DOCKERFILE_EOF`,
              'cat Dockerfile',
              `docker build -t ${repositoryName}:latest .`,
            ],
          },
          post_build: {
            commands: [
              'echo Pushing Docker image to ECR...',
              `docker tag ${repositoryName}:latest ${this.repository.repositoryUri}:latest`,
              `docker push ${this.repository.repositoryUri}:latest`,
              'echo Docker build completed successfully!',
            ],
          },
        },
      }),
    });

    // Grant ECR permissions
    this.repository.grantPullPush(this.buildProject);

    // Grant access to SageMaker base image ECR
    this.buildProject.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      }),
    );

    new CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI',
    });

    new CfnOutput(this, 'ImageUri', {
      value: this.imageUri,
      description: 'Docker Image URI for SageMaker',
    });

    new CfnOutput(this, 'BuildProjectName', {
      value: this.buildProject.projectName as string,
      description:
        'CodeBuild Project Name - Run this to build the Docker image',
    });

    // Lambda function to trigger CodeBuild (start only, no waiting)
    const buildTriggerLambda = new Function(this, 'BuildTriggerLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'on_event.handler',
      timeout: Duration.seconds(60),
      code: Code.fromAsset(props.buildTriggerLambdaPath),
    });

    // Grant CodeBuild permissions to Lambda
    buildTriggerLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
        resources: [this.buildProject.projectArn],
      }),
    );

    // Lambda function to check CodeBuild status (called periodically by Step Functions)
    const isCompleteLambda = new Function(this, 'IsCompleteLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'is_complete.handler',
      timeout: Duration.seconds(60),
      code: Code.fromAsset(props.buildTriggerLambdaPath),
    });

    isCompleteLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['codebuild:BatchGetBuilds'],
        resources: [this.buildProject.projectArn],
      }),
    );

    // Create Custom Resource Provider with async isComplete pattern
    const buildTriggerProvider = new Provider(this, 'BuildTriggerProvider', {
      onEventHandler: buildTriggerLambda,
      isCompleteHandler: isCompleteLambda,
      queryInterval: Duration.seconds(30),
      totalTimeout: Duration.minutes(60),
    });

    // Custom Resource that triggers the build only when Dockerfile changes
    this.buildTrigger = new CustomResource(this, 'BuildTrigger', {
      serviceToken: buildTriggerProvider.serviceToken,
      properties: {
        ProjectName: this.buildProject.projectName,
        // Only trigger rebuild when Dockerfile content changes
        DockerfileHash: dockerfileHash,
      },
    });

    // Ensure build happens after ECR and CodeBuild project are ready
    this.buildTrigger.node.addDependency(this.repository);
    this.buildTrigger.node.addDependency(this.buildProject);
  }
}
