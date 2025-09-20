# SecretStringGenerator Properties Examples

This document shows how to use the new AWS Secrets Manager SecretStringGenerator-compatible properties in the CDK Multi-Secret Construct.

## Basic Usage

```typescript
import { MultiSecret } from 'cdk-multi-secret-construct';

const multiSecret = new MultiSecret(this, 'MySecrets', {
  secretKeys: [
    {
      name: 'apiKey',
      passwordLength: 32,              // Default: 32
      excludeCharacters: '/@"\\\'',     // Exclude problematic characters
    },
    {
      name: 'dbPassword',
      passwordLength: 24,
      requireEachIncludedType: true,   // Ensure at least one of each character type
    },
  ],
});
```

## Advanced Character Control

```typescript
const restrictedSecrets = new MultiSecret(this, 'RestrictedSecrets', {
  secretKeys: [
    {
      name: 'numbersOnly',
      passwordLength: 20,
      excludeLowercase: true,          // No lowercase letters
      excludeUppercase: true,          // No uppercase letters
      excludePunctuation: true,        // No special characters
      // Only numbers will be included
    },
    {
      name: 'lettersWithSpaces',
      passwordLength: 25,
      excludeNumbers: true,            // No digits
      excludePunctuation: true,        // No special characters
      includeSpace: true,              // Allow spaces
      // Only letters and spaces
    },
    {
      name: 'noSpecialChars',
      passwordLength: 30,
      excludePunctuation: true,        // No special characters
      requireEachIncludedType: true,   // At least one upper, lower, and digit
    },
  ],
});
```

## Templated Secrets

```typescript
const templatedSecrets = new MultiSecret(this, 'TemplatedSecrets', {
  secretKeys: [
    {
      name: 'databaseCredentials',
      passwordLength: 16,
      secretStringTemplate: JSON.stringify({
        username: 'admin',
        host: 'localhost',
        port: 5432,
        database: 'myapp'
      }),
      generateStringKey: 'password',   // The key where the generated password will be placed
      excludeCharacters: '/@"\\\'`',
    },
    {
      name: 'apiConfig',
      passwordLength: 32,
      secretStringTemplate: JSON.stringify({
        baseUrl: 'https://api.example.com',
        version: 'v1'
      }),
      generateStringKey: 'apiKey',
      requireEachIncludedType: true,
    },
  ],
});
```

## Breaking Change Notice

**Version 0.2.0+**: The old `length` property has been removed. Use `passwordLength` instead:

```typescript
// ❌ Old style no longer supported (removed in v0.2.0)
// { name: 'key', length: 32 }

// ✅ New style (required in v0.2.0+)
const modernStyle = new MultiSecret(this, 'ModernStyle', {
  secretKeys: [
    {
      name: 'modernKey',
      passwordLength: 32,              // Required property name
      excludeCharacters: '/@"\\\'',
      requireEachIncludedType: true,
    },
  ],
});
```

## Using Generated Secrets

```typescript
// Access individual secret values
const apiKey = multiSecret.getSecretValue('apiKey');
const dbPassword = multiSecret.getSecretValue('dbPassword');

// Use in ECS tasks
const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
taskDefinition.addContainer('app', {
  image: ecs.ContainerImage.fromRegistry('myapp:latest'),
  secrets: {
    API_KEY: multiSecret.getSecret('apiKey'),
    DB_PASSWORD: multiSecret.getSecret('dbPassword'),
  },
});

// For templated secrets, the entire JSON structure is the secret value
const dbCredentials = multiSecret.getSecretValue('databaseCredentials');
// This would contain: {"username":"admin","host":"localhost","port":5432,"database":"myapp","password":"generated-password"}
```

## Property Reference

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | **Required.** The key name in the secret JSON |
| `passwordLength` | number | The desired length of the generated password (default: 32) |
| `excludeCharacters` | string | Characters that shouldn't be included in the generated password |
| `excludeLowercase` | boolean | Don't include lowercase letters |
| `excludeNumbers` | boolean | Don't include digits |
| `excludePunctuation` | boolean | Don't include punctuation characters |
| `excludeUppercase` | boolean | Don't include uppercase letters |
| `includeSpace` | boolean | Include the space character |
| `requireEachIncludedType` | boolean | Include at least one of every allowed character type |
| `secretStringTemplate` | string | A JSON string template that the generated password will be added to |
| `generateStringKey` | string | The key name where the generated password will be placed in the template |

## Migration from v0.1.x to v0.2.0+

**Breaking Change**: The `length` property has been removed. Migration steps:

1. **Replace `length` with `passwordLength`** in all secret key configurations
2. All other properties remain the same
3. New properties are optional and can be added as needed

```typescript
// ❌ Before (v0.1.x)
{
  name: 'mySecret',
  length: 32,                          // Removed in v0.2.0
  excludeCharacters: '/@"\\\'',
  requireEachIncludedType: true,
}

// ✅ After (v0.2.0+)
{
  name: 'mySecret',
  passwordLength: 32,                  // Required property name
  excludeCharacters: '/@"\\\'',
  requireEachIncludedType: true,
  // Add new properties as needed
  excludePunctuation: false,
  includeSpace: false,
}
```

**Search and Replace**: Use this regex to update your code:
- Find: `length:\s*(\d+)`
- Replace: `passwordLength: $1`