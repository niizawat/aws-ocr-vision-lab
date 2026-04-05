import { Stack, StackProps, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { OcrApi } from ':aws-ocr-vision-lab/common-constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiStackProps extends StackProps {
  userPool: UserPool;
  bucket: Bucket;
  endpointName: string;
}

export class ApiStack extends Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const ocrApi = new OcrApi(this, 'OcrApi', {
      userPool: props.userPool,
      bucket: props.bucket,
      endpointName: props.endpointName,
      lambdaCodePath: path.join(__dirname, '../../lambda'),
    });

    this.apiUrl = Fn.join('', [
      'https://',
      ocrApi.api.restApiId,
      '.execute-api.',
      this.region,
      '.amazonaws.com/',
      ocrApi.api.deploymentStage.stageName,
    ]);
  }
}
