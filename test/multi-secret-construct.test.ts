import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MultiSecret, SecretKeyConfig } from '../lib/multi-secret-construct';

describe('MultiSecret', () => {
  let stack: cdk.Stack;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
  });

  describe('Basic functionality', () => {
    test('creates a secret with basic configuration', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'apiKey', length: 32 },
        { name: 'dbPassword', length: 24, requireEachIncludedType: true },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
        description: 'Test multi-secret',
      });

      const template = Template.fromStack(stack);

      // Check that a Secrets Manager secret is created
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Description: 'Test multi-secret',
        GenerateSecretString: {
          SecretStringTemplate: '{}',
          GenerateStringKey: 'placeholder',
          ExcludeCharacters: '{}[]()"\'/\\`~,;.<>',
        },
      });

      // Check that a Lambda function is created
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.11',
        Handler: 'lambda_handler.handler',
        Description: 'Populates multi-secret with generated values',
      });

      // Check that a custom resource is created
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        SecretKeys: [
          {
            name: 'apiKey',
            length: 32,
          },
          {
            name: 'dbPassword',
            length: 24,
            requireEachIncludedType: true,
          },
        ],
      });
    });

    test('creates IAM permissions for Lambda to update secret', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'testKey', length: 32 },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
      });

      const template = Template.fromStack(stack);

      // Check that the Lambda has permission to update the secret
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                'secretsmanager:PutSecretValue',
                'secretsmanager:UpdateSecret',
                'secretsmanager:UpdateSecretVersionStage',
              ],
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('Configuration validation', () => {
    test('throws error when no secret keys provided', () => {
      expect(() => {
        new MultiSecret(stack, 'TestSecret', {
          secretKeys: [],
        });
      }).toThrow('At least one secret key must be provided');
    });

    test('throws error when secret key names are not unique', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'duplicate', length: 32 },
        { name: 'duplicate', length: 24 },
      ];

      expect(() => {
        new MultiSecret(stack, 'TestSecret', {
          secretKeys,
        });
      }).toThrow('Secret key names must be unique');
    });
  });

  describe('getSecret method', () => {
    test('returns ECS secret for valid key', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'apiKey', length: 32 },
        { name: 'dbPassword', length: 24 },
      ];

      const multiSecret = new MultiSecret(stack, 'TestSecret', {
        secretKeys,
      });

      // Should not throw for valid keys
      expect(() => multiSecret.getSecret('apiKey')).not.toThrow();
      expect(() => multiSecret.getSecret('dbPassword')).not.toThrow();

      // The returned object should be an ECS Secret
      const ecsSecret = multiSecret.getSecret('apiKey');
      expect(ecsSecret).toBeDefined();
    });

    test('throws error for invalid key', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'apiKey', length: 32 },
      ];

      const multiSecret = new MultiSecret(stack, 'TestSecret', {
        secretKeys,
      });

      expect(() => multiSecret.getSecret('invalidKey')).toThrow(
        "Secret key 'invalidKey' is not configured in this MultiSecret. Available keys: apiKey"
      );
    });
  });

  describe('Advanced configuration', () => {
    test('supports custom KMS key', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'testKey', length: 32 },
      ];

      const kmsKey = new cdk.aws_kms.Key(stack, 'TestKey');

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
        encryptionKey: kmsKey,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        KmsKeyId: {
          'Fn::GetAtt': [Match.stringLikeRegexp('TestKey.*'), 'Arn'],
        },
      });
    });

    test('supports custom secret name', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'testKey', length: 32 },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
        secretName: 'my-custom-secret-name',
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'my-custom-secret-name',
      });
    });

    test('supports different removal policies', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'testKey', length: 32 },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      const template = Template.fromStack(stack);

      template.hasResource('AWS::SecretsManager::Secret', {
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain',
      });
    });
  });

  describe('SecretKey configurations', () => {
    test('supports various secret key configurations', () => {
      const secretKeys: SecretKeyConfig[] = [
        {
          name: 'simpleKey',
          length: 16,
        },
        {
          name: 'complexKey',
          length: 32,
          excludeCharacters: '/@"\\\'',
          requireEachIncludedType: true,
        },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        SecretKeys: [
          {
            name: 'simpleKey',
            length: 16,
          },
          {
            name: 'complexKey',
            length: 32,
            excludeCharacters: '/@"\\\'',
            requireEachIncludedType: true,
          },
        ],
      });
    });
  });

  describe('Resource dependencies', () => {
    test('custom resource depends on secret', () => {
      const secretKeys: SecretKeyConfig[] = [
        { name: 'testKey', length: 32 },
      ];

      new MultiSecret(stack, 'TestSecret', {
        secretKeys,
      });

      const template = Template.fromStack(stack);

      // Find the custom resource and verify it has a dependency on the secret
      const resources = template.toJSON().Resources;
      const customResource = Object.values(resources).find(
        (resource: any) => resource.Type === 'AWS::CloudFormation::CustomResource'
      ) as any;

      expect(customResource.DependsOn).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/TestSecret.*/)
        ])
      );
    });
  });

  describe('Configuration hash', () => {
    test('generates hashes for configurations', () => {
      const secretKeys1: SecretKeyConfig[] = [
        { name: 'key1', length: 32 },
      ];

      new MultiSecret(stack, 'TestSecret1', {
        secretKeys: secretKeys1,
      });

      const template = Template.fromStack(stack);

      // Check that a configuration hash is generated
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        ConfigHash: Match.stringLikeRegexp('^[a-f0-9]+$'),
      });
    });
  });
});