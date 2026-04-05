<p align="center">
  <img src="docs/assets/logo.png" alt="OCR Vision Lab Logo" width="120">
</p>

<h1 align="center">OCR Vision Lab</h1>

<p align="center">
  <strong>A serverless OCR playground for testing PaddleOCR models on AWS infrastructure</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/PaddleOCR-3.2.2-blue?logo=paddlepaddle" alt="PaddleOCR">
  <img src="https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/AWS-SageMaker-FF9900?logo=amazonaws&logoColor=white" alt="SageMaker">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/AWS_CDK-2.x-FF9900?logo=amazonaws" alt="AWS CDK">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Nx-22.x-143055?logo=nx&logoColor=white" alt="Nx">
</p>

<p align="center">
  <strong>English</strong> | <a href="docs/README_ko.md">한국어</a> | <a href="docs/README_ja.md">日本語</a>
</p>

<p align="center">
  <a href="docs/demo.md"><strong>View Demo</strong></a>
</p>

<p align="center">
  <a href="#features">Features</a> |
  <a href="#architecture">Architecture</a> |
  <a href="#getting-started">Getting Started</a> |
  <a href="#deployment">Deployment</a> |
  <a href="#supported-models">Models</a>
</p>

---

## Overview

OCR Vision Lab is a web-based playground for testing and experimenting with [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) models on AWS infrastructure. It provides an intuitive interface to upload documents, select OCR models, and visualize extraction results with bounding box overlays.

> **Note**: This is not a production solution — it's a playground for testing PaddleOCR models on AWS infrastructure. Designed for experimentation, evaluation, and development purposes.

![Screenshot](docs/assets/screenshot.png)

## Features

- **Multiple OCR Models**
  - **PP-OCRv5**: General-purpose OCR with high accuracy for text extraction
  - **PP-StructureV3**: Document structure analysis with table and layout detection
  - **PaddleOCR-VL**: Vision-language model for complex document understanding

- **Rich Language Support**: 80+ languages including Korean, English, Chinese, Japanese, and more

- **Supported File Formats**: PNG, JPEG, TIFF, PDF (up to 100MB)

- **Interactive Result Viewer**
  - Zoom and pan controls for detailed inspection
  - Bounding box overlay visualization
  - Multiple output formats (Markdown, HTML, JSON, Blocks)

- **Serverless Architecture**: Fully managed AWS infrastructure with auto-scaling

## Architecture
![Architecture](docs/assets/architecture.png)

### Components

| Component | AWS Service | Description |
|-----------|-------------|-------------|
| Frontend | CloudFront + S3 | React-based web application |
| Authentication | Cognito | User authentication and authorization |
| API | API Gateway + Lambda | RESTful API endpoints |
| OCR Engine | SageMaker Endpoint | PaddleOCR model inference |
| Storage | S3 | Document storage and OCR results |
| Container | ECR + CodeBuild | Docker image for SageMaker |

### Workflow

1. User authenticates via Amazon Cognito
2. Document is uploaded through the React frontend
3. API Gateway triggers Lambda function
4. Lambda uploads document to S3 and invokes SageMaker endpoint
5. SageMaker runs PaddleOCR inference on the document
6. Results are stored in S3 and returned to the frontend
7. Frontend displays extracted text with visual overlays

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (recommended) or manually install:
  - Node.js v22+, pnpm v10+, Python 3.12+, AWS CDK
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab

# Install tools via mise (auto-installs Node, pnpm, Python, CDK)
mise install

# Install dependencies
pnpm install
```

### Local Development

```bash
# Start the frontend development server
mise run dev
```

---

## Deployment

### Deploy via AWS CloudShell (Recommended)

The easiest way to deploy is using AWS CloudShell, which comes pre-configured with AWS credentials.

1. Open [AWS CloudShell](https://console.aws.amazon.com/cloudshell/) in your AWS Console

2. Clone the repository and run the deployment script:
```bash
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab
chmod +x deploy.sh cleanup.sh
./deploy.sh
```

3. The script will prompt for:
   - Admin email address (for Cognito)
   - SageMaker instance type

4. Wait for deployment to complete (~20-30 minutes)

5. Access the application URL provided at the end

### Stack Structure

| Stack | Description |
|-------|-------------|
| **PaddleOCR-Infra** | S3 bucket, ECR repository, CodeBuild project |
| **PaddleOCR-Model** | Model artifacts (inference.py) uploaded to S3 |
| **PaddleOCR-Identity** | Cognito User Pool and Identity Pool |
| **PaddleOCR-Endpoint** | SageMaker inference endpoint |
| **PaddleOCR-Api** | API Gateway + Lambda functions |
| **PaddleOCR-Frontend** | CloudFront + S3 static website |

### Manual Deployment (Local)

If you prefer to deploy from your local machine:

```bash
# Create .env.local with your AWS config
echo "AWS_REGION=ap-northeast-2" > .env.local
echo "AWS_PROFILE=your-profile" >> .env.local

# Deploy all stacks
mise run deploy

# Or deploy a specific stack
mise run deploy:stack
```

### Cost Management

> **Warning**: SageMaker endpoint runs 24/7 and costs approximately **$1,000+/month** for ml.g5.xlarge.

To stop costs when not in use:
```bash
# Delete only the SageMaker endpoint
./cleanup.sh --endpoint-only

# Delete all resources
./cleanup.sh
```

### Environment Variables

Configure in `.env.local` (auto-loaded by mise):

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region |
| `AWS_PROFILE` | AWS CLI profile name |

## Supported Models

### PP-OCRv5

General-purpose OCR optimized for text extraction with high accuracy.

**Options:**
- Language selection (80+ languages)
- Document orientation classification
- Document unwarping
- Textline orientation detection

### PP-StructureV3

Advanced document structure analysis with layout understanding.

**Options:**
- Language selection
- Document orientation classification
- Document unwarping

**Output includes:**
- Document titles and paragraph titles
- Tables (with markdown formatting)
- Text blocks with spatial information

### PaddleOCR-VL

Vision-language model for complex document understanding tasks.

**Best for:**
- Mixed content documents
- Complex layouts
- Documents requiring contextual understanding

## Project Structure

```
aws-ocr-vision-lab/
├── .mise.toml               # Tool versions & tasks (mise)
├── .env.local                # AWS profile & region (git-ignored)
├── packages/
│   ├── frontend/             # React web application
│   │   └── src/
│   │       ├── components/
│   │       │   ├── OcrPage/    # Result viewer components
│   │       │   ├── AppLayout/  # App shell & sidebar
│   │       │   └── DocumentEditor/
│   │       ├── hooks/          # Custom React hooks
│   │       ├── utils/          # PDF & OCR helper utilities
│   │       ├── routes/         # Page routes
│   │       └── types/          # TypeScript types
│   ├── infra/                # AWS CDK infrastructure
│   │   ├── src/stacks/         # CDK stack definitions
│   │   ├── lambda/             # Lambda functions (Python)
│   │   ├── layers/             # Lambda layers (DuckDB)
│   │   └── model/code/         # SageMaker inference code
│   └── common/constructs/   # Shared CDK constructs
├── docs/                     # Documentation
└── README.md
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Python 3.14 (Lambda), PaddleOCR, DuckDB
- **Infrastructure**: AWS CDK (TypeScript)
- **Build System**: Nx Monorepo, mise
- **AWS Services**: CloudFront, S3, API Gateway, Lambda, SageMaker, Cognito, ECR, CodeBuild

## License

This project is licensed under the [MIT License](LICENSE).

