import { Duration, CfnOutput, Stack, Fn } from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  Cors,
  GatewayResponse,
  ResponseType,
} from 'aws-cdk-lib/aws-apigateway';
import { Function, Runtime, Architecture, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { RuntimeConfig } from './runtime-config.js';

export interface OcrApiProps {
  userPool: UserPool;
  bucket: Bucket;
  endpointName: string;
  lambdaCodePath: string;
}

export class OcrApi extends Construct {
  public readonly api: RestApi;
  public readonly requestLambda: Function;
  public readonly statusLambda: Function;
  public readonly presignedUrlLambda: Function;
  public readonly imageManagerLambda: Function;
  public readonly jobListLambda: Function;

  constructor(scope: Construct, id: string, props: OcrApiProps) {
    super(scope, id);

    const region = Stack.of(this).region;

    // Cognito Authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // DuckDB Lambda Layer for job metadata management
    const duckdbLayer = new LayerVersion(this, 'DuckDBLayer', {
      code: Code.fromAsset(path.join(props.lambdaCodePath, '..', 'layers', 'duckdb'), {
        bundling: {
          image: Runtime.PYTHON_3_14.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install duckdb -t /asset-output/python',
          ],
        },
      }),
      compatibleRuntimes: [Runtime.PYTHON_3_14],
      compatibleArchitectures: [Architecture.ARM_64],
      description: 'DuckDB for job metadata management',
    });

    // Presigned URL Lambda (Python) - for large file uploads
    this.presignedUrlLambda = new Function(this, 'PresignedUrlLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'presigned_url.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(10),
      memorySize: 128,
      architecture: Architecture.ARM_64,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        REGION: region,
      },
    });

    // OCR Request Lambda (Python)
    this.requestLambda = new Function(this, 'RequestLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'ocr_request.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(30),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      layers: [duckdbLayer],
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        ENDPOINT_NAME: props.endpointName,
        REGION: region,
      },
    });

    // OCR Status Lambda (Python)
    this.statusLambda = new Function(this, 'StatusLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'ocr_status.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(10),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      layers: [duckdbLayer],
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        REGION: region,
      },
    });

    // Image Manager Lambda (Python) - for reading and deleting S3 images
    this.imageManagerLambda = new Function(this, 'ImageManagerLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'image_manager.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(30),
      memorySize: 128,
      architecture: Architecture.ARM_64,
      layers: [duckdbLayer],
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        REGION: region,
      },
    });

    // Job List Lambda (Python) - for listing user's jobs from S3
    this.jobListLambda = new Function(this, 'JobListLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'job_list.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(30),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      layers: [duckdbLayer],
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        REGION: region,
      },
    });

    // Grant S3 permissions
    props.bucket.grantReadWrite(this.requestLambda);
    props.bucket.grantReadWrite(this.statusLambda);
    props.bucket.grantPut(this.presignedUrlLambda);
    props.bucket.grantReadWrite(this.imageManagerLambda); // Read for presigned URLs, Delete for cleanup
    props.bucket.grantReadWrite(this.jobListLambda); // Read/write parquet for job listing

    // Grant SageMaker permissions
    this.requestLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['sagemaker:InvokeEndpointAsync'],
        resources: [
          `arn:aws:sagemaker:${region}:${Stack.of(this).account}:endpoint/${props.endpointName}`,
        ],
      }),
    );

    // API Gateway
    this.api = new RestApi(this, 'Api', {
      restApiName: 'OCR API',
      description: 'PaddleOCR-VL Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      deployOptions: {
        tracingEnabled: true, // X-Ray Tracing
      },
    });

    // POST /upload - Get presigned URL for S3 upload
    const uploadResource = this.api.root.addResource('upload');
    uploadResource.addMethod(
      'POST',
      new LambdaIntegration(this.presignedUrlLambda),
      {
        authorizer,
        authorizationType: AuthorizationType.COGNITO,
      },
    );

    // POST /ocr
    const ocrResource = this.api.root.addResource('ocr');
    ocrResource.addMethod('POST', new LambdaIntegration(this.requestLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // GET /ocr/{jobId}
    const jobResource = ocrResource.addResource('{jobId}');
    jobResource.addMethod('GET', new LambdaIntegration(this.statusLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // GET /jobs - List all jobs for the user
    const jobsResource = this.api.root.addResource('jobs');
    jobsResource.addMethod('GET', new LambdaIntegration(this.jobListLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // /image/{proxy+} - Image management (GET presigned URL, DELETE)
    const imageResource = this.api.root.addResource('image');
    const imageProxyResource = imageResource.addResource('{proxy+}');

    // GET /image/{proxy+} - Get presigned URL for reading image
    imageProxyResource.addMethod(
      'GET',
      new LambdaIntegration(this.imageManagerLambda),
      {
        authorizer,
        authorizationType: AuthorizationType.COGNITO,
      },
    );

    // DELETE /image/{proxy+} - Delete S3 objects (input + output)
    imageProxyResource.addMethod(
      'DELETE',
      new LambdaIntegration(this.imageManagerLambda),
      {
        authorizer,
        authorizationType: AuthorizationType.COGNITO,
      },
    );

    // Add CORS headers to 4XX/5XX error responses (for Cognito auth errors)
    new GatewayResponse(this, 'Default4xxResponse', {
      restApi: this.api,
      type: ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers':
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,DELETE,OPTIONS'",
      },
    });

    new GatewayResponse(this, 'Default5xxResponse', {
      restApi: this.api,
      type: ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers':
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,DELETE,OPTIONS'",
      },
    });

    // Add API URL to runtime config (remove trailing slash)
    const apiUrlWithoutTrailingSlash = Fn.join('', [
      'https://',
      this.api.restApiId,
      '.execute-api.',
      region,
      '.amazonaws.com/',
      this.api.deploymentStage.stageName,
    ]);
    RuntimeConfig.ensure(this).config.apiUrl = apiUrlWithoutTrailingSlash;

    new CfnOutput(this, 'ApiUrl', {
      value: apiUrlWithoutTrailingSlash,
      description: 'OCR API URL',
    });
  }
}
