import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Configuration for a single secret key within the multi-secret.
 */
export interface SecretKeyConfig {
  /** The key name in the secret JSON */
  readonly name: string;
  /** Length of the generated value (default: 32) */
  readonly length?: number;
  /** Characters to exclude from generation */
  readonly excludeCharacters?: string;
  /** Ensure at least one of each character type (uppercase, lowercase, digit, symbol) */
  readonly requireEachIncludedType?: boolean;
}

/**
 * Properties for the MultiSecret construct.
 */
export interface MultiSecretProps {
  /** Array of secret key configurations */
  readonly secretKeys: SecretKeyConfig[];
  /** Description for the secret (optional) */
  readonly description?: string;
  /** Name for the secret (optional, will be auto-generated if not provided) */
  readonly secretName?: string;
  /** KMS key for encryption (optional) */
  readonly encryptionKey?: cdk.aws_kms.IKey;
  /** Whether to remove the secret when the stack is deleted (default: true) */
  readonly removalPolicy?: cdk.RemovalPolicy;
}

/**
 * A construct that creates an AWS Secrets Manager secret containing multiple
 * auto-generated key-value pairs.
 *
 * The secret is created and managed by CDK, while a Lambda function populates
 * it with cryptographically secure generated values based on your configuration.
 *
 * @example
 * ```typescript
 * const multiSecret = new MultiSecret(this, 'MyMultiSecret', {
 *   secretKeys: [
 *     {
 *       name: 'apiKey',
 *       length: 32,
 *       excludeCharacters: '/@"\\\'',
 *     },
 *     {
 *       name: 'dbPassword',
 *       length: 24,
 *       requireEachIncludedType: true,
 *     },
 *   ],
 *   description: 'Multiple API keys and passwords',
 * });
 *
 * // Use individual secret values
 * const apiKey = multiSecret.getSecretValue('apiKey');
 * const dbPassword = multiSecret.getSecretValue('dbPassword');
 *
 * // For ECS tasks and other services
 * const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
 * taskDefinition.addContainer('Container', {
 *   secrets: {
 *     API_KEY: multiSecret.getSecret('apiKey'),
 *     DB_PASSWORD: multiSecret.getSecret('dbPassword'),
 *   },
 * });
 * ```
 */
export class MultiSecret extends Construct {
  /** The AWS Secrets Manager secret containing multiple generated values */
  public readonly secret: secretsmanager.Secret;

  /** The Lambda function that populates the secret values */
  public readonly populatorFunction: lambda.Function;

  /** The secret keys configuration for validation */
  private readonly secretKeys: SecretKeyConfig[];

  constructor(scope: Construct, id: string, props: MultiSecretProps) {
    super(scope, id);

    // Store secret keys for validation
    this.secretKeys = props.secretKeys;

    // Validate input
    if (!props.secretKeys || props.secretKeys.length === 0) {
      throw new Error('At least one secret key must be provided');
    }

    // Validate secret key names are unique
    const names = props.secretKeys.map(k => k.name);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      throw new Error('Secret key names must be unique');
    }

    // Create the secret with CDK
    this.secret = new secretsmanager.Secret(this, 'Secret', {
      description: props.description || 'Secret containing multiple generated key-value pairs',
      secretName: props.secretName,
      encryptionKey: props.encryptionKey,
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'placeholder',
        excludeCharacters: '{}[]()"\'/\\`~,;.<>',
      },
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    // Create the Lambda function that populates the secret
    // Fixed asset path for library distribution
    this.populatorFunction = new lambda.Function(this, 'PopulatorFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'assets', 'multi-secret-creator')),
      timeout: cdk.Duration.minutes(5),
      description: 'Populates multi-secret with generated values',
    });

    // Grant the Lambda function permissions to update the secret
    this.secret.grantWrite(this.populatorFunction);

    // Create custom resource to populate the secret values
    const secretProvider = new cr.Provider(this, 'SecretProvider', {
      onEventHandler: this.populatorFunction,
    });

    const populatorResource = new cdk.CustomResource(this, 'PopulatorResource', {
      serviceToken: secretProvider.serviceToken,
      properties: {
        SecretArn: this.secret.secretArn,
        SecretKeys: props.secretKeys,
        // Add a hash of the configuration to force updates when config changes
        ConfigHash: this.hashSecretKeys(props.secretKeys),
      },
    });

    // Ensure the custom resource runs after the secret is created
    populatorResource.node.addDependency(this.secret);
  }

  /**
   * Get a secret value for a specific key.
   *
   * @param keyName The name of the key in the secret JSON
   * @returns SecretValue that can be used in other CDK constructs
   */
  public getSecretValue(keyName: string): cdk.SecretValue {
    return this.secret.secretValueFromJson(keyName);
  }

  /**
   * Get an ECS Secret for a specific key.
   *
   * This is useful for passing secrets to ECS tasks, Fargate services,
   * and other AWS services that expect ecs.Secret objects.
   *
   * @param secretKey The name of the key in the secret JSON
   * @returns ecs.Secret that can be used in ECS task definitions
   * @throws Error if the secretKey is not in the configured secret keys
   *
   * @example
   * ```typescript
   * const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
   * taskDefinition.addContainer('Container', {
   *   image: ecs.ContainerImage.fromRegistry('nginx'),
   *   secrets: {
   *     API_KEY: multiSecret.getSecret('apiKey'),
   *     DB_PASSWORD: multiSecret.getSecret('dbPassword'),
   *   },
   * });
   * ```
   */
  public getSecret(secretKey: string): ecs.Secret {
    // Validate that the secret key exists in our configuration
    const secretKeyNames = this.secretKeys.map(k => k.name);
    if (!secretKeyNames.includes(secretKey)) {
      throw new Error(
        `Secret key '${secretKey}' is not configured in this MultiSecret. ` +
        `Available keys: ${secretKeyNames.join(', ')}`
      );
    }

    return ecs.Secret.fromSecretsManager(this.secret, secretKey);
  }

  /**
   * Grant read permissions to a principal for this secret.
   *
   * @param grantee The principal to grant permissions to
   */
  public grantRead(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.secret.grantRead(grantee);
  }

  /**
   * Grant write permissions to a principal for this secret.
   *
   * @param grantee The principal to grant permissions to
   */
  public grantWrite(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.secret.grantWrite(grantee);
  }

  /**
   * Create a hash of the secret keys configuration to detect changes.
   */
  private hashSecretKeys(secretKeys: SecretKeyConfig[]): string {
    const configString = JSON.stringify(secretKeys, Object.keys(secretKeys).sort());
    // Simple hash function for configuration changes
    let hash = 0;
    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}