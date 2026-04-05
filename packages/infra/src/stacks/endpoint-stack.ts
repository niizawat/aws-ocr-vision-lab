import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { OcrEndpoint } from ':aws-ocr-vision-lab/common-constructs';

export interface EndpointStackProps extends StackProps {
  bucket: Bucket;
  imageUri: string;
  modelDataUrl: string;
  instanceType?: string;
}

export class EndpointStack extends Stack {
  public readonly endpointName: string;

  constructor(scope: Construct, id: string, props: EndpointStackProps) {
    super(scope, id, props);

    const ocrEndpoint = new OcrEndpoint(this, 'OcrEndpoint', {
      outputBucket: props.bucket,
      imageUri: props.imageUri,
      modelDataUrl: props.modelDataUrl,
      instanceType: props.instanceType || 'ml.g5.xlarge',
    });

    this.endpointName = ocrEndpoint.endpointName;
  }
}
