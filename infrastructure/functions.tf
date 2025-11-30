resource "google_storage_bucket" "function_bucket" {
  name     = "${var.project_id}-functions"
  location = var.region
  uniform_bucket_level_access = true
}

data "archive_file" "function_source" {
  type        = "zip"
  output_path = "/tmp/function-source.zip"
  source_dir  = "../cloud-functions"
  excludes    = ["node_modules", "dist", ".git"]
}

resource "google_storage_bucket_object" "function_archive" {
  name   = "source-${data.archive_file.function_source.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.function_source.output_path
}

resource "google_cloudfunctions2_function" "ai_proxy" {
  name        = "ai-proxy"
  location    = var.region
  description = "AI Proxy for Groq"

  build_config {
    runtime     = "nodejs20"
    entry_point = "aiProxy"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.function_archive.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    min_instance_count = 0 # Scale to zero
    available_memory   = "256M"
    timeout_seconds    = 60
    environment_variables = {
      GROQ_API_KEY = "projects/${var.project_id}/secrets/groq-api-key/versions/latest"
    }
  }
}
