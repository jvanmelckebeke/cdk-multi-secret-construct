"""
AWS Lambda handler for populating Secrets Manager secrets with multiple generated values.

This function is triggered by CloudFormation custom resources to generate and update
secret values in an existing AWS Secrets Manager secret.
"""

import json
import string
import secrets
import boto3
from typing import Dict, Any, List


def generate_secret_value(
    length: int = 32,
    exclude_chars: str = "",
    require_each_type: bool = False
) -> str:
    """
    Generate a cryptographically secure random string.

    Args:
        length: Length of the generated string
        exclude_chars: Characters to exclude from generation
        require_each_type: Ensure at least one of each character type

    Returns:
        Generated secret string
    """
    # Build character set
    chars = string.ascii_letters + string.digits
    if not exclude_chars or '!' not in exclude_chars:
        chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'

    # Remove excluded characters
    if exclude_chars:
        chars = ''.join(c for c in chars if c not in exclude_chars)

    if require_each_type:
        # Ensure at least one of each type
        password = []
        password.append(secrets.choice(string.ascii_lowercase))
        password.append(secrets.choice(string.ascii_uppercase))
        password.append(secrets.choice(string.digits))

        # Add special character if not excluded
        if '!' not in exclude_chars:
            special_chars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
            available_special = ''.join(c for c in special_chars if c not in exclude_chars)
            if available_special:
                password.append(secrets.choice(available_special))

        # Fill the rest randomly
        for _ in range(length - len(password)):
            password.append(secrets.choice(chars))

        # Shuffle the password
        secrets.SystemRandom().shuffle(password)
        return ''.join(password)
    else:
        return ''.join(secrets.choice(chars) for _ in range(length))


def generate_multiple_secrets(secret_keys: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Generate multiple secret values based on configuration.

    Args:
        secret_keys: List of secret key configurations

    Returns:
        Dictionary of key names to generated secret values
    """
    secret_values = {}

    for key_config in secret_keys:
        name = key_config['name']
        length = int(key_config.get('length', 32))
        exclude_chars = key_config.get('excludeCharacters', '')
        require_each_type = key_config.get('requireEachIncludedType', False)

        secret_values[name] = generate_secret_value(
            length=length,
            exclude_chars=exclude_chars,
            require_each_type=require_each_type
        )

    return secret_values


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    CloudFormation custom resource handler for populating secrets.

    Args:
        event: CloudFormation custom resource event
        context: Lambda context object

    Returns:
        CloudFormation custom resource response
    """
    print(f"Event: {json.dumps(event, default=str)}")

    request_type = event['RequestType']

    if request_type in ['Create', 'Update']:
        try:
            secret_arn = event['ResourceProperties']['SecretArn']
            secret_keys = event['ResourceProperties']['SecretKeys']

            secretsmanager = boto3.client('secretsmanager')

            # Generate the secret values
            secret_values = generate_multiple_secrets(secret_keys)

            # Update the secret with generated values
            secretsmanager.update_secret(
                SecretId=secret_arn,
                SecretString=json.dumps(secret_values)
            )

            return {
                'PhysicalResourceId': f'secret-populator-{secret_arn}',
                'Data': {
                    'SecretArn': secret_arn,
                    'Success': True
                }
            }

        except Exception as e:
            print(f"Error generating secrets: {e}")
            raise

    elif request_type == 'Delete':
        # Nothing to clean up - CDK will handle the secret deletion
        return {
            'PhysicalResourceId': event['PhysicalResourceId']
        }

    else:
        raise ValueError(f"Unknown request type: {request_type}")