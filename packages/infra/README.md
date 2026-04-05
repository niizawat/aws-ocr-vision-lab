# @aws-ocr-vision-lab/infra

This library was generated with [@aws/nx-plugin](https://github.com/awslabs/nx-plugin-for-aws/).

## Building

Run `pnpm exec nx build @aws-ocr-vision-lab/infra [--skip-nx-cache]` to build the application.

## Running unit tests

Run `pnpm exec nx test @aws-ocr-vision-lab/infra` to execute the unit tests via Vitest.

### Updating snapshots

To update snapshots, run the following command:

`pnpm exec nx test @aws-ocr-vision-lab/infra --configuration=update-snapshot`

## Run lint

Run `pnpm exec nx lint @aws-ocr-vision-lab/infra`

### Fixable issues

You can also automatically fix some lint errors by running the following command:

`pnpm exec nx lint @aws-ocr-vision-lab/infra --configuration=fix`

## Deploy to AWS

### Deploy all Stacks

```bash
mise run deploy
```

### Deploy a single Stack

```bash
mise run deploy:stack
```

### Stack Structure

| Stack | Description |
|-------|-------------|
| PaddleOCR-Infra | S3, ECR, CodeBuild |
| PaddleOCR-Model | Model artifacts |
| PaddleOCR-Identity | Cognito |
| PaddleOCR-Endpoint | SageMaker |
| PaddleOCR-Api | API Gateway + Lambda |
| PaddleOCR-Frontend | CloudFront + S3 |

### Hotswap deployment

> [!CAUTION]
> Not to be used in production deployments

Use the --hotswap flag with the deploy target to attempt to update your AWS resources directly instead of generating an AWS CloudFormation change set and deploying it. Deployment falls back to AWS CloudFormation deployment if hot swapping is not possible.

Currently hot swapping supports Lambda functions, Step Functions state machines, and Amazon ECS container images. The --hotswap flag also disables rollback (i.e., implies --no-rollback).

Run `pnpm exec nx deploy @aws-ocr-vision-lab/infra --hotswap --all`

## Checkov Rule Suppressions

There may be instances where you want to suppress certain rules on resources. You can do this in two ways:

### Supress a rule on a given construct

```typescript
import { suppressRules } from ':aws-ocr-vision-lab/common-constructs';

...
// suppresses the RULE_NAME for the given construct.
suppressRules(construct, ['RULE_NAME'], 'Reason');
```

### Supress a rule on a descendant construct

```typescript
import { suppressRules } from ':aws-ocr-vision-lab/common-constructs';

...
// Supresses the RULE_NAME for the construct or any of its descendants if it is an instance of Bucket
suppressRule(construct, ['RULE_NAME'], 'Reason', (construct) => construct instanceof Bucket);
```

## Useful links

- [Infra reference docs](https://awslabs.github.io/nx-plugin-for-aws/en/guides/typescript-infrastructure/)
- [Learn more about NX](https://nx.dev/getting-started/intro)
