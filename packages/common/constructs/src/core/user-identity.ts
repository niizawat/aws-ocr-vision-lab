import {
  IdentityPool,
  UserPoolAuthenticationProvider,
} from 'aws-cdk-lib/aws-cognito-identitypool';
import { CfnOutput, Duration, Lazy, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { RuntimeConfig } from './runtime-config.js';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { suppressRules } from './checkov.js';

const WEB_CLIENT_ID = 'WebClient';

export interface UserIdentityProps {
  /**
   * Additional callback/logout URLs (e.g. CloudFront domains from other stacks)
   */
  additionalCallbackUrls?: string[];
}

/**
 * Creates a UserPool and Identity Pool with sane defaults configured intended for usage from a web client.
 */
export class UserIdentity extends Construct {
  public readonly region: string;
  public readonly identityPool: IdentityPool;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly userPoolDomain: UserPoolDomain;

  private readonly additionalCallbackUrls: string[];

  constructor(scope: Construct, id: string, props?: UserIdentityProps) {
    super(scope, id);

    this.additionalCallbackUrls = props?.additionalCallbackUrls ?? [];
    this.region = Stack.of(this).region;
    this.userPool = this.createUserPool();
    this.userPoolDomain = this.createUserPoolDomain(this.userPool);
    this.userPoolClient = this.createUserPoolClient(this.userPool);
    this.identityPool = this.createIdentityPool(
      this.userPool,
      this.userPoolClient,
    );
    this.createManagedLoginBranding(
      this.userPool,
      this.userPoolClient,
      this.userPoolDomain,
    );

    RuntimeConfig.ensure(this).config.cognitoProps = {
      region: Stack.of(this).region,
      identityPoolId: this.identityPool.identityPoolId,
      userPoolId: this.userPool.userPoolId,
      userPoolWebClientId: this.userPoolClient.userPoolClientId,
    };

    new CfnOutput(this, `${id}-UserPoolId`, {
      value: this.userPool.userPoolId,
    });

    new CfnOutput(this, `${id}-UserPoolClientId`, {
      value: this.userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, `${id}-IdentityPoolId`, {
      value: this.identityPool.identityPoolId,
    });
  }

  private createUserPool = () =>
    new UserPool(this, 'UserPool', {
      deletionProtection: false,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      mfa: Mfa.OFF,
      signInCaseSensitive: false,
      signInAliases: { username: true, email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      selfSignUpEnabled: true,
      standardAttributes: {
        phoneNumber: { required: false },
        email: { required: true },
        givenName: { required: true },
        familyName: { required: true },
      },
      autoVerify: {
        email: true,
      },
      keepOriginal: {
        email: true,
      },
    });

  private createUserPoolDomain = (userPool: UserPool) =>
    userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: `ocr-lab-${Stack.of(this).account}`,
      },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

  private createUserPoolClient = (userPool: UserPool) => {
    const lazilyComputedCallbackUrls = Lazy.list({
      produce: () =>
        [
          'http://localhost:4200',
          'http://localhost:4300',
          `https://${Stack.of(this).region}.console.aws.amazon.com`,
        ]
          .concat(
            this.findCloudFrontDistributions().map(
              (d) => `https://${d.domainName}`,
            ),
          )
          .concat(this.additionalCallbackUrls),
    });

    return userPool.addClient(WEB_CLIENT_ID, {
      authFlows: {
        userPassword: true,
        userSrp: true,
        user: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        callbackUrls: lazilyComputedCallbackUrls,
        logoutUrls: lazilyComputedCallbackUrls,
      },
      preventUserExistenceErrors: true,
    });
  };

  private createIdentityPool = (
    userPool: UserPool,
    userPoolClient: UserPoolClient,
  ) => {
    const identityPool = new IdentityPool(this, 'IdentityPool');

    identityPool.addUserPoolAuthentication(
      new UserPoolAuthenticationProvider({
        userPool,
        userPoolClient,
      }),
    );

    return identityPool;
  };

  private createManagedLoginBranding = (
    userPool: UserPool,
    userPoolClient: UserPoolClient,
    userPoolDomain: UserPoolDomain,
  ) => {
    new CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    }).node.addDependency(userPoolClient, userPool, userPoolDomain);
  };

  private findCloudFrontDistributions = (): Distribution[] =>
    Stack.of(this)
      .node.findAll()
      .filter((child) => child instanceof Distribution);
}
