variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "stripe_secret_key" {
  description = "Stripe Secret Key (sk_test_xxx or sk_live_xxx)"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe Webhook Signing Secret (whsec_xxx)"
  type        = string
  sensitive   = true
  default     = ""
}
