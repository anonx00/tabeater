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
        return 1
    fi
    return 0
}

IN_CLOUD_SHELL=false
if [ -n "$CLOUD_SHELL" ] || [ -n "$GOOGLE_CLOUD_PROJECT" ]; then
    IN_CLOUD_SHELL=true
fi

if [ "$IN_CLOUD_SHELL" = true ]; then
    echo -e "${GREEN}Detected: Google Cloud Shell${NC}"
    echo ""
fi

if ! check_command "node" "Install from: https://nodejs.org/"; then
    if [ "$IN_CLOUD_SHELL" = true ]; then
        echo -e "${YELLOW}Installing Node.js...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
        sudo apt-get install -y nodejs > /dev/null 2>&1
    else
        exit 1
    fi
fi

check_command "npm" "Install from: https://nodejs.org/" || exit 1

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
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/const DEV_MODE = false;/const DEV_MODE = true;/g' extension/src/services/license.ts 2>/dev/null || true
        sed -i '' 's/const DEV_MODE = true;/const DEV_MODE = true;/g' extension/src/services/license.ts 2>/dev/null || true
    else
        sed -i 's/const DEV_MODE = false;/const DEV_MODE = true;/g' extension/src/services/license.ts 2>/dev/null || true
    fi

    echo -e "${YELLOW}[2/3] Installing dependencies...${NC}"
    npm install --silent

    echo -e "${YELLOW}[3/3] Building extension...${NC}"
    npm run build

    cd dist && zip -r ../phantom-tabs-dev.zip . > /dev/null && cd ..

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  DEV MODE Ready!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Extension: ${YELLOW}dist/${NC}"
    echo -e "ZIP file:  ${YELLOW}phantom-tabs-dev.zip${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Load in Chrome:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "  1. Go to chrome://extensions"
    echo "  2. Enable 'Developer mode' (top-right toggle)"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select the dist/ folder"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test Checklist:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "  [ ] Click extension icon - popup opens"
    echo "  [ ] Tab list shows your open tabs"
    echo "  [ ] Click 'Organize' - tabs group by domain"
    echo "  [ ] Click 'Duplicates' - finds duplicate tabs"
    echo "  [ ] Click 'Analyze' - AI analysis (needs AI setup)"
    echo "  [ ] Click 'Config' - options page opens"
    echo "  [ ] Status shows 'PRO' (dev mode)"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Enable AI (for Analyze feature):${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "  Option A: Gemini Nano (local, free)"
    echo "    1. Go to chrome://flags/#optimization-guide-on-device-model"
    echo "    2. Set to 'Enabled BypassPerfRequirement'"
    echo "    3. Restart Chrome"
    echo ""
    echo "  Option B: Cloud API"
    echo "    1. Click 'Config' in extension popup"
    echo "    2. Select Gemini/OpenAI/Anthropic"
    echo "    3. Enter your API key"
    echo ""
    echo -e "${GREEN}DEV Features:${NC}"
    echo "  ✓ Unlimited AI queries"
    echo "  ✓ PRO status always active"
    echo "  ✓ No backend required"
    echo ""

    if [ "$IN_CLOUD_SHELL" = true ]; then
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}Download extension:${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo "  cloudshell download phantom-tabs-dev.zip"
        echo ""
    fi

    echo -e "${GREEN}Next: Test everything, then run ./deploy.sh again for PROD${NC}"
    echo ""
    exit 0
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PROD MODE Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

check_command "gcloud" "Install from: https://cloud.google.com/sdk/docs/install" || exit 1

if ! command -v terraform &> /dev/null; then
    if [ "$IN_CLOUD_SHELL" = true ]; then
        echo -e "${YELLOW}Installing Terraform...${NC}"
        sudo apt-get update > /dev/null 2>&1
        sudo apt-get install -y gnupg software-properties-common > /dev/null 2>&1
        wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null
        echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
        sudo apt-get update > /dev/null 2>&1
        sudo apt-get install -y terraform > /dev/null 2>&1
        echo -e "${GREEN}Terraform installed${NC}"
    else
        echo -e "${RED}Error: terraform is not installed${NC}"
        echo "Install from: https://developer.hashicorp.com/terraform/downloads"
        exit 1
    fi
fi

if [ "$IN_CLOUD_SHELL" = true ] && [ -n "$GOOGLE_CLOUD_PROJECT" ]; then
    PROJECT_ID="$GOOGLE_CLOUD_PROJECT"
    echo -e "Detected Project ID: ${GREEN}$PROJECT_ID${NC}"
    read -p "Use this project? [Y/n]: " USE_DETECTED
    if [[ "$USE_DETECTED" =~ ^[Nn]$ ]]; then
        read -p "Enter your GCP Project ID: " PROJECT_ID
    fi
elif [ "$IN_CLOUD_SHELL" = true ]; then
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -n "$PROJECT_ID" ]; then
        echo -e "Detected Project ID: ${GREEN}$PROJECT_ID${NC}"
        read -p "Use this project? [Y/n]: " USE_DETECTED
        if [[ "$USE_DETECTED" =~ ^[Nn]$ ]]; then
            read -p "Enter your GCP Project ID: " PROJECT_ID
        fi
    else
        read -p "Enter your GCP Project ID: " PROJECT_ID
    fi
else
    read -p "Enter your GCP Project ID: " PROJECT_ID
fi

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
if [ "$IN_CLOUD_SHELL" = false ]; then
    gcloud auth application-default login 2>/dev/null || true
fi

echo -e "${YELLOW}[2/8] Setting project...${NC}"
gcloud config set project $PROJECT_ID 2>/dev/null

echo -e "${YELLOW}[2.5/8] Enabling required GCP APIs...${NC}"
echo "(This may take 1-2 minutes on first run...)"
gcloud services enable cloudresourcemanager.googleapis.com --quiet 2>/dev/null || true
gcloud services enable iam.googleapis.com --quiet 2>/dev/null || true
gcloud services enable cloudfunctions.googleapis.com --quiet 2>/dev/null || true
gcloud services enable cloudbuild.googleapis.com --quiet 2>/dev/null || true
gcloud services enable run.googleapis.com --quiet 2>/dev/null || true
gcloud services enable firestore.googleapis.com --quiet 2>/dev/null || true
gcloud services enable artifactregistry.googleapis.com --quiet 2>/dev/null || true
echo -e "${GREEN}APIs enabled${NC}"

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
        -var="stripe_webhook_secret=" 2>&1 | grep -E "(Apply|Creating|created|Error|error)" || true
else
    terraform apply -auto-approve \
        -var="project_id=$PROJECT_ID" \
        -var="stripe_secret_key=$STRIPE_SECRET_KEY" \
        -var="stripe_webhook_secret=$STRIPE_WEBHOOK_SECRET" 2>&1 | grep -E "(Apply|Creating|created|Error|error)" || true
fi

FUNCTION_URL=$(terraform output -raw function_url 2>/dev/null)
WEBHOOK_URL=$(terraform output -raw webhook_url 2>/dev/null)

cd ..

echo -e "${YELLOW}[7/8] Configuring extension for production...${NC}"

if [ -n "$FUNCTION_URL" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api|${FUNCTION_URL}|g" extension/src/services/license.ts
        sed -i '' 's/const DEV_MODE = true;/const DEV_MODE = false;/g' extension/src/services/license.ts
    else
        sed -i "s|https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api|${FUNCTION_URL}|g" extension/src/services/license.ts
        sed -i 's/const DEV_MODE = true;/const DEV_MODE = false;/g' extension/src/services/license.ts
    fi
else
    echo -e "${RED}Warning: Could not get function URL from Terraform${NC}"
fi

echo -e "${YELLOW}[8/8] Building extension...${NC}"
npm run build

cd dist && zip -r ../phantom-tabs.zip . > /dev/null && cd ..

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
echo -e "${GREEN}Extension Ready${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Extension ZIP: ${YELLOW}phantom-tabs.zip${NC}"
echo ""

if [ "$IN_CLOUD_SHELL" = true ]; then
    echo "Download phantom-tabs.zip from Cloud Shell file browser"
    echo ""
fi

echo "To load in Chrome:"
echo "  1. Go to chrome://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Drag phantom-tabs.zip or 'Load unpacked' → dist/"
echo ""

cat > .env.local << EOF
# PHANTOM TABS - Production Config
# Generated: $(date)

PROJECT_ID=$PROJECT_ID
FUNCTION_URL=$FUNCTION_URL
WEBHOOK_URL=$WEBHOOK_URL
STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY
EOF

echo -e "${GREEN}Config saved to .env.local${NC}"
echo ""
