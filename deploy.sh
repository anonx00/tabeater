#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PHANTOM TABS - Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: terraform not installed${NC}"
    echo "Install from: https://developer.hashicorp.com/terraform/downloads"
    exit 1
fi

if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: ./deploy.sh <project-id> [stripe-secret-key]${NC}"
    echo ""
    echo "Arguments:"
    echo "  project-id        Your GCP project ID"
    echo "  stripe-secret-key Your Stripe secret key (optional, will prompt if not provided)"
    echo ""
    echo "Example:"
    echo "  ./deploy.sh my-phantom-tabs sk_test_xxx"
    exit 1
fi

PROJECT_ID=$1
STRIPE_KEY=${2:-""}

if [ -z "$STRIPE_KEY" ]; then
    echo -e "${YELLOW}Enter your Stripe Secret Key:${NC}"
    read -s STRIPE_KEY
    echo ""
fi

if [[ ! "$STRIPE_KEY" =~ ^sk_(test|live)_ ]]; then
    echo -e "${RED}Error: Invalid Stripe key format. Must start with sk_test_ or sk_live_${NC}"
    exit 1
fi

echo -e "${GREEN}[1/6] Authenticating with GCP...${NC}"
gcloud auth application-default login --quiet 2>/dev/null || true
gcloud config set project $PROJECT_ID

echo -e "${GREEN}[2/6] Enabling billing check...${NC}"
BILLING=$(gcloud billing projects describe $PROJECT_ID --format="value(billingEnabled)" 2>/dev/null || echo "false")
if [ "$BILLING" != "True" ]; then
    echo -e "${YELLOW}Warning: Billing may not be enabled. Enable at:${NC}"
    echo "https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
fi

echo -e "${GREEN}[3/6] Installing backend dependencies...${NC}"
cd backend/functions
npm install --silent
cd ../..

echo -e "${GREEN}[4/6] Initializing Terraform...${NC}"
cd terraform
terraform init -input=false

echo -e "${GREEN}[5/6] Deploying infrastructure...${NC}"
terraform apply -auto-approve \
    -var="project_id=$PROJECT_ID" \
    -var="stripe_secret_key=$STRIPE_KEY" \
    -var="stripe_webhook_secret="

FUNCTION_URL=$(terraform output -raw function_url)
WEBHOOK_URL=$(terraform output -raw webhook_url)

cd ..

echo -e "${GREEN}[6/6] Updating extension config...${NC}"
sed -i.bak "s|https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api|$FUNCTION_URL|g" extension/src/services/license.ts
rm -f extension/src/services/license.ts.bak

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Function URL: ${YELLOW}$FUNCTION_URL${NC}"
echo -e "Webhook URL:  ${YELLOW}$WEBHOOK_URL${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Configure Stripe Webhook:"
echo "   - Go to: https://dashboard.stripe.com/webhooks"
echo "   - Add endpoint: $WEBHOOK_URL"
echo "   - Select event: checkout.session.completed"
echo "   - Copy the signing secret (whsec_xxx)"
echo ""
echo "2. Update webhook secret:"
echo "   cd terraform"
echo "   terraform apply -var=\"project_id=$PROJECT_ID\" -var=\"stripe_secret_key=$STRIPE_KEY\" -var=\"stripe_webhook_secret=whsec_xxx\""
echo ""
echo "3. Set DEV_MODE to false:"
echo "   Edit extension/src/services/license.ts line 3"
echo "   Change: const DEV_MODE = false;"
echo ""
echo "4. Build extension:"
echo "   npm run build"
echo ""
echo "5. Test in Chrome:"
echo "   Load dist/ folder as unpacked extension"
echo ""
