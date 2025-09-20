# CDK Multi-Secret Construct

[![npm version](https://badge.fury.io/js/cdk-multi-secret-construct.svg)](https://badge.fury.io/js/cdk-multi-secret-construct)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful AWS CDK construct for creating AWS Secrets Manager secrets containing multiple auto-generated key-value pairs. Perfect for applications that need multiple API keys, passwords, or tokens in a single secret.

## 🚀 Features

- **🏗️ CDK-Managed**: Secret created as proper CloudFormation resource
- **🔒 Secure Generation**: Cryptographically strong random values using Python's `secrets` module
- **⚙️ Configurable**: Individual settings per key (length, exclusions, complexity)
- **🔄 Auto-Updates**: Configuration changes trigger regeneration
- **🎯 Easy Access**: Standard JSON field access for individual keys
- **🐳 ECS Integration**: Built-in `getSecret()` method for ECS tasks and containers
- **✅ Validation**: Runtime validation ensures you only access configured keys
- **📦 Zero Dependencies**: Only requires aws-cdk-lib and constructs

## 📦 Installation

```bash
npm install cdk-multi-secret-construct
```

```bash
yarn add cdk-multi-secret-construct
```

## 🎯 Quick Start

```typescript
import { MultiSecret } from 'cdk-multi-secret-construct';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a multi-secret with custom configurations
    const multiSecret = new MultiSecret(this, 'AppSecrets', {
      secretKeys: [
        {
          name: 'apiKey',
          length: 32,
          excludeCharacters: '/@"\\\'',
        },
        {
          name: 'dbPassword',
          length: 24,
          requireEachIncludedType: true, // Ensures mixed case + digits + symbols
          excludeCharacters: '/@"\\\'`',
        },
        {
          name: 'jwtSecret',
          length: 64,
        },
      ],
      description: 'Application secrets for MyApp',
    });

    // Use individual secret values
    const apiKey = multiSecret.getSecretValue('apiKey');
    const dbPassword = multiSecret.getSecretValue('dbPassword');

    // For ECS tasks
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
    taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromRegistry('nginx'),
      secrets: {
        API_KEY: multiSecret.getSecret('apiKey'),
        DB_PASSWORD: multiSecret.getSecret('dbPassword'),
      },
    });
  }
}
```

## 📋 What This Creates

The construct creates a single AWS Secrets Manager secret containing multiple generated values:

```json
{
  "apiKey": "Kx8mN3vF9pR7wQ2sT5yU6iO1eW4rE3nM",
  "dbPassword": "Zx7#mK2@nQ4$wF6s",
  "jwtSecret": "Lp8xK1nQ9mR3wF5sT7yU2iO4eW6rE8nMvC9zB0dG3fH5jK8lN1pQ4mR7wF2s"
}
```

## ⚙️ Configuration Options

### SecretKeyConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | The key name in the secret JSON |
| `length` | `number` | `32` | Length of the generated value |
| `excludeCharacters` | `string` | `""` | Characters to exclude from generation |
| `requireEachIncludedType` | `boolean` | `false` | Ensure at least one of each character type |

### MultiSecretProps

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `secretKeys` | `SecretKeyConfig[]` | *required* | Array of secret key configurations |
| `description` | `string` | Auto-generated | Description for the secret |
| `secretName` | `string` | Auto-generated | Name for the secret |
| `encryptionKey` | `IKey` | Default AWS key | KMS key for encryption |
| `removalPolicy` | `RemovalPolicy` | `DESTROY` | What to do when stack is deleted |

## 🔧 API Reference

### MultiSecret

#### Methods

##### `getSecretValue(keyName: string): SecretValue`
Returns a CDK SecretValue for use in other constructs.

```typescript
const apiKey = multiSecret.getSecretValue('apiKey');
```

##### `getSecret(secretKey: string): ecs.Secret`
Returns an ECS Secret for use in ECS task definitions. Validates that the key exists.

```typescript
const ecsSecret = multiSecret.getSecret('apiKey');
```

##### `grantRead(grantee: IGrantable): Grant`
Grants read permissions to a principal.

```typescript
multiSecret.grantRead(myLambdaFunction);
```

##### `grantWrite(grantee: IGrantable): Grant`
Grants write permissions to a principal.

```typescript
multiSecret.grantWrite(myLambdaFunction);
```

#### Properties

- `secret: Secret` - The underlying Secrets Manager secret
- `populatorFunction: Function` - The Lambda function that generates values

## 📖 Usage Examples

### Basic Multi-Secret

```typescript
const secrets = new MultiSecret(this, 'BasicSecrets', {
  secretKeys: [
    { name: 'apiKey', length: 32 },
    { name: 'webhookSecret', length: 40 },
  ],
});
```

### Complex Configuration

```typescript
const secrets = new MultiSecret(this, 'ComplexSecrets', {
  secretKeys: [
    {
      name: 'apiKey',
      length: 32,
      excludeCharacters: '/@"\\\'',
    },
    {
      name: 'dbPassword',
      length: 24,
      requireEachIncludedType: true,
      excludeCharacters: '/@"\\\'`',
    },
    {
      name: 'jwtSecret',
      length: 64,
    },
  ],
  description: 'Production secrets for MyApp',
  secretName: 'prod-myapp-secrets',
});
```

### ECS Integration

```typescript
const secrets = new MultiSecret(this, 'EcsSecrets', {
  secretKeys: [
    { name: 'dbPassword', length: 32, requireEachIncludedType: true },
    { name: 'apiKey', length: 40 },
  ],
});

const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
taskDefinition.addContainer('App', {
  image: ecs.ContainerImage.fromRegistry('myapp:latest'),
  environment: {
    NODE_ENV: 'production',
  },
  secrets: {
    DATABASE_PASSWORD: secrets.getSecret('dbPassword'),
    API_KEY: secrets.getSecret('apiKey'),
  },
});
```

### Lambda Function Access

```typescript
const secrets = new MultiSecret(this, 'LambdaSecrets', {
  secretKeys: [
    { name: 'apiKey', length: 32 },
    { name: 'encryptionKey', length: 64 },
  ],
});

const fn = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  environment: {
    SECRET_ARN: secrets.secret.secretArn,
  },
});

secrets.grantRead(fn);
```

## 🔍 Accessing Secrets

### AWS CLI
```bash
# Get the entire secret
aws secretsmanager get-secret-value --secret-id "your-secret-name"

# Get a specific key using jq
aws secretsmanager get-secret-value --secret-id "your-secret-name" \
  --query 'SecretString' --output text | jq -r '.apiKey'
```

### In Your Application (Node.js)
```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient();

async function getSecrets() {
  const response = await client.send(new GetSecretValueCommand({
    SecretId: "your-secret-arn"
  }));

  const secrets = JSON.parse(response.SecretString);

  console.log('API Key:', secrets.apiKey);
  console.log('DB Password:', secrets.dbPassword);
}
```

### In Another CDK Stack
```typescript
// Import the secret in another stack
const importedSecret = secretsmanager.Secret.fromSecretCompleteArn(
  this,
  'ImportedSecret',
  'arn:aws:secretsmanager:region:account:secret:name'
);

// Use individual keys
const apiKey = importedSecret.secretValueFromJson('apiKey');
```

## 🏗️ How It Works

1. **CDK Creates Secret**: A standard AWS Secrets Manager secret is created with initial placeholder content
2. **Lambda Populates**: A custom Lambda function generates cryptographically secure values for each configured key
3. **Custom Resource**: CloudFormation custom resource triggers the Lambda to populate the secret on stack creation/updates
4. **Configuration Changes**: Hash-based detection triggers regeneration when secret key configuration changes

## 🔒 Security Considerations

- All secrets are generated using Python's cryptographically secure `secrets` module
- Secrets are encrypted at rest using AWS KMS (default AWS managed key or your custom key)
- Lambda function has minimal IAM permissions (only secret update access)
- No secrets are logged or stored in CloudFormation templates
- Runtime validation prevents access to non-configured keys

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/yourusername/cdk-multi-secret-construct.git
cd cdk-multi-secret-construct

# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm run test

# Package for local testing
npm run package
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [AWS CDK](https://aws.amazon.com/cdk/)
- Inspired by the need for better secret management in CDK projects
- Thanks to the AWS CDK community for patterns and best practices