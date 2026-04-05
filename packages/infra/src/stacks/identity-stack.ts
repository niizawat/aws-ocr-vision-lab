import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { UserIdentity } from ':aws-ocr-vision-lab/common-constructs';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

export interface IdentityStackProps extends StackProps {
  additionalCallbackUrls?: string[];
}

export class IdentityStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClientId: string;
  public readonly identityPoolId: string;

  constructor(scope: Construct, id: string, props?: IdentityStackProps) {
    super(scope, id, props);

    const identity = new UserIdentity(this, 'Identity', {
      additionalCallbackUrls: props?.additionalCallbackUrls,
    });
    this.userPool = identity.userPool;
    this.userPoolClientId = identity.userPoolClient.userPoolClientId;
    this.identityPoolId = identity.identityPool.identityPoolId;
  }
}
