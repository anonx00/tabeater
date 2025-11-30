terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "firestore.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "phantom_tabs" {
  account_id   = "phantom-tabs-sa"
  display_name = "PHANTOM TABS Service Account"
  description  = "Service account for PHANTOM TABS Cloud Function"
}

resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.phantom_tabs.email}"
}

resource "google_project_iam_member" "logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.phantom_tabs.email}"
}

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.required_apis]
}

resource "google_storage_bucket" "function_source" {
  name     = "${var.project_id}-function-source"
  location = var.region

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

data "archive_file" "function_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/functions"
  output_path = "${path.module}/function-source.zip"
}

resource "google_storage_bucket_object" "function_source" {
  name   = "function-source-${data.archive_file.function_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.function_zip.output_path
}

resource "google_cloudfunctions2_function" "api" {
  name     = "api"
  location = var.region

  build_config {
    runtime     = "nodejs20"
    entry_point = "api"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.function_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 10
    min_instance_count    = 0
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.phantom_tabs.email

    environment_variables = {
      STRIPE_SECRET_KEY      = var.stripe_secret_key
      STRIPE_WEBHOOK_SECRET  = var.stripe_webhook_secret
    }
  }

  depends_on = [
    google_project_service.required_apis,
    google_firestore_database.default
  ]
}

resource "google_cloud_run_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  service  = google_cloudfunctions2_function.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "function_url" {
  value       = google_cloudfunctions2_function.api.service_config[0].uri
  description = "The URL of the deployed Cloud Function"
}

output "service_account_email" {
  value       = google_service_account.phantom_tabs.email
  description = "The service account email"
}

output "webhook_url" {
  value       = "${google_cloudfunctions2_function.api.service_config[0].uri}/webhook"
  description = "The Stripe webhook URL"
}
