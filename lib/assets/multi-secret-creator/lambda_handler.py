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
    password_length: int = 32,
    exclude_characters: str = "",
    exclude_lowercase: bool = False,
    exclude_numbers: bool = False,
    exclude_punctuation: bool = False,
    exclude_uppercase: bool = False,
    include_space: bool = False,
    require_each_included_type: bool = False
) -> str:
    """
    Generate a cryptographically secure random string.
    Based on AWS Secrets Manager SecretStringGenerator parameters.

    Args:
        password_length: The desired length of the generated password
        exclude_characters: Characters that shouldn't be included in the generated password
        exclude_lowercase: Don't include lowercase letters
        exclude_numbers: Don't include digits
        exclude_punctuation: Don't include punctuation characters
        exclude_uppercase: Don't include uppercase letters
        include_space: Include the space character
        require_each_included_type: Include at least one of every allowed character type

    Returns:
        Generated secret string
    """
    # Build character sets based on inclusion/exclusion rules
    char_sets = []
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    punctuation = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    space = ' '

    # Apply character type exclusions
    if not exclude_lowercase:
        char_sets.append(lowercase)
    if not exclude_uppercase:
        char_sets.append(uppercase)
    if not exclude_numbers:
        char_sets.append(digits)
    if not exclude_punctuation:
        char_sets.append(punctuation)
    if include_space:
        char_sets.append(space)

    # Combine all allowed character sets
    all_chars = ''.join(char_sets)

    # Remove specifically excluded characters
    if exclude_characters:
        all_chars = ''.join(c for c in all_chars if c not in exclude_characters)

    if not all_chars:
        raise ValueError("No valid characters remaining after applying exclusion rules")

    if require_each_included_type:
        # Ensure at least one of each allowed character type
        password = []

        if not exclude_lowercase:
            available_lowercase = ''.join(c for c in lowercase if c not in exclude_characters)
            if available_lowercase:
                password.append(secrets.choice(available_lowercase))

        if not exclude_uppercase:
            available_uppercase = ''.join(c for c in uppercase if c not in exclude_characters)
            if available_uppercase:
                password.append(secrets.choice(available_uppercase))

        if not exclude_numbers:
            available_digits = ''.join(c for c in digits if c not in exclude_characters)
            if available_digits:
                password.append(secrets.choice(available_digits))

        if not exclude_punctuation:
            available_punctuation = ''.join(c for c in punctuation if c not in exclude_characters)
            if available_punctuation:
                password.append(secrets.choice(available_punctuation))

        if include_space and ' ' not in exclude_characters:
            password.append(' ')

        # Fill the rest randomly from all allowed characters
        remaining_length = password_length - len(password)
        if remaining_length > 0:
            for _ in range(remaining_length):
                password.append(secrets.choice(all_chars))

        # Shuffle the password to avoid predictable patterns
        secrets.SystemRandom().shuffle(password)
        return ''.join(password[:password_length])
    else:
        return ''.join(secrets.choice(all_chars) for _ in range(password_length))


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

        # Extract SecretStringGenerator parameters
        password_length = int(key_config.get('passwordLength', 32))
        exclude_characters = key_config.get('excludeCharacters', '')
        exclude_lowercase = key_config.get('excludeLowercase', False)
        exclude_numbers = key_config.get('excludeNumbers', False)
        exclude_punctuation = key_config.get('excludePunctuation', False)
        exclude_uppercase = key_config.get('excludeUppercase', False)
        include_space = key_config.get('includeSpace', False)
        require_each_included_type = key_config.get('requireEachIncludedType', False)

        # Handle secretStringTemplate and generateStringKey if provided
        secret_string_template = key_config.get('secretStringTemplate')
        generate_string_key = key_config.get('generateStringKey')

        if secret_string_template and generate_string_key:
            # Parse the template JSON and add the generated value
            try:
                template_obj = json.loads(secret_string_template)
                generated_value = generate_secret_value(
                    password_length=password_length,
                    exclude_characters=exclude_characters,
                    exclude_lowercase=exclude_lowercase,
                    exclude_numbers=exclude_numbers,
                    exclude_punctuation=exclude_punctuation,
                    exclude_uppercase=exclude_uppercase,
                    include_space=include_space,
                    require_each_included_type=require_each_included_type
                )
                template_obj[generate_string_key] = generated_value
                secret_values[name] = json.dumps(template_obj)
            except json.JSONDecodeError:
                # If template is invalid, fall back to simple string generation
                secret_values[name] = generate_secret_value(
                    password_length=password_length,
                    exclude_characters=exclude_characters,
                    exclude_lowercase=exclude_lowercase,
                    exclude_numbers=exclude_numbers,
                    exclude_punctuation=exclude_punctuation,
                    exclude_uppercase=exclude_uppercase,
                    include_space=include_space,
                    require_each_included_type=require_each_included_type
                )
        else:
            # Standard string generation
            secret_values[name] = generate_secret_value(
                password_length=password_length,
                exclude_characters=exclude_characters,
                exclude_lowercase=exclude_lowercase,
                exclude_numbers=exclude_numbers,
                exclude_punctuation=exclude_punctuation,
                exclude_uppercase=exclude_uppercase,
                include_space=include_space,
                require_each_included_type=require_each_included_type
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