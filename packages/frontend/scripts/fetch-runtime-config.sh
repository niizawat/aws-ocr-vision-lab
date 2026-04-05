#!/bin/bash
# Fetch runtime config from deployed CloudFormation stacks

IDENTITY_STACK="${IDENTITY_STACK:-PaddleOCR-Identity}"
API_STACK="${API_STACK:-PaddleOCR-Api}"
AWS_PROFILE="${AWS_PROFILE:-default}"
OUTPUT_FILE="$(dirname "$0")/../public/runtime-config.json"

echo "Fetching runtime config..."

# Get Identity stack outputs (Cognito)
IDENTITY_OUTPUTS=$(AWS_PROFILE=$AWS_PROFILE aws cloudformation describe-stacks \
  --stack-name "$IDENTITY_STACK" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null)

# Get API stack outputs
API_OUTPUTS=$(AWS_PROFILE=$AWS_PROFILE aws cloudformation describe-stacks \
  --stack-name "$API_STACK" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null)

# Fallback: try old single stack name
if [ -z "$IDENTITY_OUTPUTS" ] || [ "$IDENTITY_OUTPUTS" = "null" ]; then
  echo "Trying legacy stack PaddleOCR-Application..."
  LEGACY_OUTPUTS=$(AWS_PROFILE=$AWS_PROFILE aws cloudformation describe-stacks \
    --stack-name "PaddleOCR-Application" \
    --query 'Stacks[0].Outputs' \
    --output json 2>/dev/null)
  IDENTITY_OUTPUTS="$LEGACY_OUTPUTS"
  API_OUTPUTS="$LEGACY_OUTPUTS"
fi

if [ -z "$IDENTITY_OUTPUTS" ] || [ "$IDENTITY_OUTPUTS" = "null" ]; then
  echo "Warning: Could not fetch stack outputs. Using existing runtime-config.json if available."
  exit 0
fi

# Extract Cognito values from Identity stack
USER_POOL_ID=$(echo "$IDENTITY_OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("UserPoolId") and (contains("Client") | not)) | .OutputValue' | head -1)
USER_POOL_CLIENT_ID=$(echo "$IDENTITY_OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("UserPoolClientId")) | .OutputValue' | head -1)
IDENTITY_POOL_ID=$(echo "$IDENTITY_OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("IdentityPoolId")) | .OutputValue' | head -1)

# Extract API URL from API stack
API_URL=$(echo "$API_OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("ApiUrl")) | .OutputValue' | head -1)

# Get region from user pool ID
REGION=$(echo "$USER_POOL_ID" | cut -d'_' -f1)

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "null" ]; then
  echo "Warning: Could not extract UserPoolId from stack outputs."
  exit 0
fi

# Generate runtime-config.json
cat > "$OUTPUT_FILE" << EOF
{
  "cognitoProps": {
    "region": "$REGION",
    "identityPoolId": "$IDENTITY_POOL_ID",
    "userPoolId": "$USER_POOL_ID",
    "userPoolWebClientId": "$USER_POOL_CLIENT_ID"
  },
  "apiUrl": "$API_URL"
}
EOF

echo "Updated runtime-config.json:"
cat "$OUTPUT_FILE"
