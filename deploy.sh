#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  PHANTOM TABS - Deployment${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

print_header

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "$2"
        exit 1
    fi
}

check_command "gcloud" "Install from: https://cloud.google.com/sdk/docs/install"
check_command "terraform" "Install from: https://developer.hashicorp.com/terraform/downloads"
check_command "node" "Install from: https://nodejs.org/"
check_command "npm" "Install from: https://nodejs.org/"

echo -e "${BLUE}Select deployment mode:${NC}"
echo ""
echo "  1) DEV  - Local testing, no backend needed"
echo "           (Unlimited AI, no payments, no GCP)"
echo ""
echo "  2) PROD - Full deployment to GCP"
echo "           (Requires Stripe keys, deploys backend)"
echo ""
read -p "Enter choice [1/2]: " MODE_CHOICE

case $MODE_CHOICE in
    1|dev|DEV)
        DEPLOY_MODE="dev"
        ;;
    2|prod|PROD)
        DEPLOY_MODE="prod"
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

if [ "$DEPLOY_MODE" == "dev" ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  DEV MODE Setup${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    echo -e "${YELLOW}[1/3] Setting DEV_MODE = true...${NC}"
    sed -i.bak 's/const DEV_MODE = false;/const DEV_MODE = true;/g' extension/src/services/license.ts 2>/dev/null || \
    sed -i.bak 's/const DEV_MODE = true;/const DEV_MODE = true;/g' extension/src/services/license.ts
    rm -f extension/src/services/license.ts.bak

    echo -e "${YELLOW}[2/3] Installing dependencies...${NC}"
    npm install --silent

    echo -e "${YELLOW}[3/3] Building extension...${NC}"
    npm run build

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  DEV MODE Ready!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Extension built in ${YELLOW}dist/${NC} folder"
    echo ""
    echo -e "${BLUE}To load in Chrome:${NC}"
    echo "  1. Go to chrome://extensions"
    echo "  2. Enable 'Developer mode'"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select the dist/ folder"
    echo ""
    echo -e "${GREEN}Features in DEV mode:${NC}"
    echo "  - Unlimited AI queries"
    echo "  - No payment required"
    echo "  - No backend calls"
    echo "  - PRO status always active"
    echo ""
    exit 0
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PROD MODE Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

read -p "Enter your GCP Project ID: " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Project ID is required${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Stripe API Keys${NC}"
echo "Get your keys from: https://dashboard.stripe.com/apikeys"
echo ""

read -p "Enter Stripe Secret Key (sk_test_xxx or sk_live_xxx): " STRIPE_SECRET_KEY

if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(test|live)_ ]]; then
    echo -e "${RED}Error: Invalid Stripe secret key format${NC}"
    exit 1
fi

read -p "Enter Stripe Publishable Key (pk_test_xxx or pk_live_xxx): " STRIPE_PUBLISHABLE_KEY

if [[ ! "$STRIPE_PUBLISHABLE_KEY" =~ ^pk_(test|live)_ ]]; then
    echo -e "${RED}Error: Invalid Stripe publishable key format${NC}"
    exit 1
fi

echo ""
read -p "Enter Stripe Webhook Secret (whsec_xxx) [leave empty to configure later]: " STRIPE_WEBHOOK_SECRET

echo ""
echo -e "${YELLOW}[1/8] Authenticating with GCP...${NC}"
gcloud auth application-default login 2>/dev/null || true

echo -e "${YELLOW}[2/8] Setting project...${NC}"
gcloud config set project $PROJECT_ID

BILLING=$(gcloud billing projects describe $PROJECT_ID --format="value(billingEnabled)" 2>/dev/null || echo "false")
if [ "$BILLING" != "True" ]; then
    echo ""
    echo -e "${RED}Warning: Billing is not enabled for this project${NC}"
    echo -e "Enable billing at: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    echo ""
    read -p "Continue anyway? [y/N]: " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${YELLOW}[3/8] Installing backend dependencies...${NC}"
cd backend/functions
npm install --silent
cd ../..

echo -e "${YELLOW}[4/8] Installing extension dependencies...${NC}"
npm install --silent

echo -e "${YELLOW}[5/8] Initializing Terraform...${NC}"
cd terraform
terraform init -input=false

echo -e "${YELLOW}[6/8] Deploying GCP infrastructure...${NC}"
echo "(This may take 2-3 minutes...)"
echo ""

if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    terraform apply -auto-approve \
        -var="project_id=$PROJECT_ID" \
        -var="stripe_secret_key=$STRIPE_SECRET_KEY" \
        -var="stripe_webhook_secret="
else
    terraform apply -auto-approve \
        -var="project_id=$PROJECT_ID" \
        -var="stripe_secret_key=$STRIPE_SECRET_KEY" \
        -var="stripe_webhook_secret=$STRIPE_WEBHOOK_SECRET"
fi

FUNCTION_URL=$(terraform output -raw function_url 2>/dev/null)
WEBHOOK_URL=$(terraform output -raw webhook_url 2>/dev/null)

cd ..

echo -e "${YELLOW}[7/8] Configuring extension for production...${NC}"

sed -i.bak "s|https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api|$FUNCTION_URL|g" extension/src/services/license.ts
sed -i.bak 's/const DEV_MODE = true;/const DEV_MODE = false;/g' extension/src/services/license.ts
rm -f extension/src/services/license.ts.bak

echo -e "${YELLOW}[8/8] Building extension...${NC}"
npm run build

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PROD Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "API URL:     ${YELLOW}$FUNCTION_URL${NC}"
echo -e "Webhook URL: ${YELLOW}$WEBHOOK_URL${NC}"
echo ""

if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}ACTION REQUIRED: Configure Stripe Webhook${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "1. Go to: https://dashboard.stripe.com/webhooks"
    echo ""
    echo "2. Click 'Add endpoint'"
    echo ""
    echo "3. Endpoint URL:"
    echo -e "   ${GREEN}$WEBHOOK_URL${NC}"
    echo ""
    echo "4. Select event: checkout.session.completed"
    echo ""
    echo "5. Click 'Add endpoint', then copy the Signing secret"
    echo ""
    echo "6. Run this command to update:"
    echo ""
    echo -e "   ${YELLOW}cd terraform && terraform apply \\${NC}"
    echo -e "   ${YELLOW}  -var=\"project_id=$PROJECT_ID\" \\${NC}"
    echo -e "   ${YELLOW}  -var=\"stripe_secret_key=$STRIPE_SECRET_KEY\" \\${NC}"
    echo -e "   ${YELLOW}  -var=\"stripe_webhook_secret=whsec_xxx\"${NC}"
    echo ""
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Next Steps${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. Load extension in Chrome:"
echo "   - Go to chrome://extensions"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' → select dist/"
echo ""
echo "2. Test the payment flow"
echo ""
echo "3. Publish to Chrome Web Store:"
echo "   cd dist && zip -r ../phantom-tabs.zip ."
echo ""

cat > .env.local << EOF
# PHANTOM TABS - Production Config
# Generated: $(date)

PROJECT_ID=$PROJECT_ID
FUNCTION_URL=$FUNCTION_URL
WEBHOOK_URL=$WEBHOOK_URL
STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY

# Keep these secret - don't commit!
# STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
# STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET
EOF

echo -e "${GREEN}Config saved to .env.local${NC}"
echo ""
