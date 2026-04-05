import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Frontend, RuntimeConfig } from ':aws-ocr-vision-lab/common-constructs';

export interface FrontendStackProps extends StackProps {
  apiUrl: string;
  cognitoProps: {
    region: string;
    identityPoolId: string;
    userPoolId: string;
    userPoolWebClientId: string;
  };
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Inject runtime config from other stacks
    const rc = RuntimeConfig.ensure(this);
    rc.config.apiUrl = props.apiUrl;
    rc.config.cognitoProps = props.cognitoProps;

    new Frontend(this, 'Frontend');
  }
}
