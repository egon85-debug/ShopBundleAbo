# Umgebung „produktion“. Aufruf: siehe docs/saas/infrastruktur.md.
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
    key                         = "produktion/terraform.tfstate"
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

  umgebung       = "produktion"
  ssh_schluessel = var.ssh_schluessel
  admin_netze    = var.admin_netze

  # Größen laut Kostenmodell (bis ca. 10 Kunden); Wachstum: nur hier ändern.
  app_servertyp  = "cx33"
  db_servertyp   = "cx33"
  db_volume_gb   = 40
  floating_ip    = true
  loeschschutz   = true
  server_backups = true

  ansible_inventar_pfad = "${path.root}/../../../ansible/inventar/produktion.yml"
}

output "plattform" {
  value = module.plattform
}
