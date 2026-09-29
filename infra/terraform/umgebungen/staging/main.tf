# Umgebung „staging“. Aufruf: siehe docs/saas/infrastruktur.md.
#
# Zustand im Hetzner Object Storage (privater Bucket). Zugangsdaten kommen
# aus der Umgebung (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), nie aus Dateien.
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.69"
    }
  }
  backend "s3" {
    bucket                      = "eg-dynamics-terraform"
    key                         = "staging/terraform.tfstate"
    region                      = "eu-central-1"
    endpoints                   = { s3 = "https://fsn1.your-objectstorage.com" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

# HCLOUD_TOKEN kommt aus der Umgebung.
provider "hcloud" {}

variable "ssh_schluessel" {
  type = map(string)
}

variable "admin_netze" {
  type = list(string)
}

module "plattform" {
  source = "../../modul/plattform"

  umgebung       = "staging"
  ssh_schluessel = var.ssh_schluessel
  admin_netze    = var.admin_netze

  # Klein, aber gleich aufgebaut wie die Produktion.
  app_servertyp = "cx23"
  db_servertyp  = "cx23"
  db_volume_gb  = 10
  floating_ip   = false
  loeschschutz  = false

  ansible_inventar_pfad = "${path.root}/../../../ansible/inventar/staging.yml"
}

output "plattform" {
  value = module.plattform
}
