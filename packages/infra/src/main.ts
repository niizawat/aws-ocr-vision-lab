import { InfraStack } from './stacks/infra-stack.js';
import { ModelStack } from './stacks/model-stack.js';
import { IdentityStack } from './stacks/identity-stack.js';
import { EndpointStack } from './stacks/endpoint-stack.js';
import { ApiStack } from './stacks/api-stack.js';
import { FrontendStack } from './stacks/frontend-stack.js';
import { App } from ':aws-ocr-vision-lab/common-constructs';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION,
};

// InfraStack: ECR, CodeBuild, S3 Bucket
const infraStack = new InfraStack(app, 'PaddleOCR-Infra', { env });

// ModelStack: inference.py -> model.tar.gz -> S3
const modelStack = new ModelStack(app, 'PaddleOCR-Model', {
  env,
  bucket: infraStack.bucket,
});
modelStack.addDependency(infraStack);

// IdentityStack: Cognito User Pool + Identity Pool
// Pass CloudFront domain via context for Cognito callback URLs
const frontendDomain = app.node.tryGetContext('frontendDomain');
const identityStack = new IdentityStack(app, 'PaddleOCR-Identity', {
  env,
  crossRegionReferences: true,
  additionalCallbackUrls: frontendDomain ? [`https://${frontendDomain}`] : [],
});

// EndpointStack: SageMaker Endpoint
const endpointStack = new EndpointStack(app, 'PaddleOCR-Endpoint', {
  env,
  bucket: infraStack.bucket,
  imageUri: infraStack.imageUri,
  modelDataUrl: modelStack.modelDataUrl,
});
endpointStack.addDependency(modelStack);

// ApiStack: API Gateway + Lambda
const apiStack = new ApiStack(app, 'PaddleOCR-Api', {
  env,
  userPool: identityStack.userPool,
  bucket: infraStack.bucket,
  endpointName: endpointStack.endpointName,
});
apiStack.addDependency(identityStack);
apiStack.addDependency(endpointStack);

// FrontendStack: CloudFront + S3
const frontendStack = new FrontendStack(app, 'PaddleOCR-Frontend', {
  env,
  crossRegionReferences: true,
  apiUrl: apiStack.apiUrl,
  cognitoProps: {
    region: identityStack.region,
    identityPoolId: identityStack.identityPoolId,
    userPoolId: identityStack.userPool.userPoolId,
    userPoolWebClientId: identityStack.userPoolClientId,
  },
});
frontendStack.addDependency(apiStack);
frontendStack.addDependency(identityStack);

app.synth();
