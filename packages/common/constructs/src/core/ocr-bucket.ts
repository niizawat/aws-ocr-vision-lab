import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  ObjectOwnership,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { suppressRules } from './checkov.js';

export interface OcrBucketProps {
  removalPolicy?: RemovalPolicy;
}

export class OcrBucket extends Construct {
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: OcrBucketProps = {}) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? RemovalPolicy.DESTROY;
    const autoDelete = removalPolicy === RemovalPolicy.DESTROY;

    // Access log bucket
    const accessLogBucket = new Bucket(this, 'AccessLogBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: autoDelete,
      lifecycleRules: [
        {
          id: 'DeleteAccessLogsAfter90Days',
          expiration: Duration.days(90),
        },
      ],
    });

    // Suppress checkov rules for access log bucket
    suppressRules(
      accessLogBucket,
      ['CKV_AWS_18', 'CKV_AWS_21'],
      'Access log bucket does not need its own access logging or versioning',
    );

    this.bucket = new Bucket(this, 'OcrBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: 'ocr-bucket-logs/',
      removalPolicy,
      autoDeleteObjects: autoDelete,
      lifecycleRules: [],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            HttpMethods.GET,
            HttpMethods.PUT,
            HttpMethods.POST,
            HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'OCR Bucket Name',
    });

    new CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'OCR Bucket ARN',
    });
  }
}
