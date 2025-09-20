/**
 * CDK Multi-Secret Construct
 *
 * A powerful AWS CDK construct for creating Secrets Manager secrets with
 * multiple auto-generated key-value pairs.
 *
 * @example
 * ```typescript
 * import { MultiSecret } from 'cdk-multi-secret-construct';
 *
 * const multiSecret = new MultiSecret(this, 'MySecrets', {
 *   secretKeys: [
 *     { name: 'apiKey', length: 32 },
 *     { name: 'dbPassword', length: 24, requireEachIncludedType: true },
 *   ],
 * });
 *
 * // Use in ECS tasks
 * taskDefinition.addContainer('Container', {
 *   secrets: {
 *     API_KEY: multiSecret.getSecret('apiKey'),
 *     DB_PASSWORD: multiSecret.getSecret('dbPassword'),
 *   },
 * });
 * ```
 */

export { MultiSecret, SecretKeyConfig, MultiSecretProps } from './multi-secret-construct';