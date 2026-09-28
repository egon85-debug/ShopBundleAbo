# Plattform-Infrastruktur einer Umgebung auf Hetzner Cloud.
#
#   Internet ── Floating IP ──▶ Anwendungsserver ──(privates Netz)──▶ Datenbankserver
#                                                                      └─ Datenträger
#
# Die Datenbank hat eine öffentliche IPv4 nur für ausgehende Verbindungen
# (Updates, Sicherung in den Object Storage); eingehend lässt die Firewall
# nur SSH aus den Admin-Netzen zu. Die Anwendung erreicht sie über das
# private Netz, für das die Hetzner-Firewall nicht gilt — dort begrenzt
# PostgreSQL selbst (pg_hba) auf die private Adresse des Anwendungsservers.

locals {
  name   = "eg-${var.umgebung}"
  labels = { plattform = "eg-dynamics", umgebung = var.umgebung }

  netz       = "10.20.0.0/16"
  subnetz    = "10.20.1.0/24"
  app_privat = "10.20.1.10"
  db_privat  = "10.20.1.20"
}

resource "hcloud_ssh_key" "admin" {
  for_each   = var.ssh_schluessel
  name       = "${local.name}-${each.key}"
  public_key = each.value
  labels     = local.labels
}

resource "hcloud_network" "netz" {
  name     = local.name
  ip_range = local.netz
  labels   = local.labels
}

resource "hcloud_network_subnet" "subnetz" {
  network_id   = hcloud_network.netz.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = local.subnetz
}

resource "hcloud_firewall" "app" {
  name   = "${local.name}-app"
  labels = local.labels

  rule {
    description = "SSH nur aus Admin-Netzen"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_netze
  }
  rule {
    description = "HTTP (Weiterleitung auf HTTPS, Zertifikatsprüfung)"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
  rule {
    description = "HTTPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
  rule {
    description = "HTTP/3"
    direction   = "in"
    protocol    = "udp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_firewall" "db" {
  name   = "${local.name}-db"
  labels = local.labels

  rule {
    description = "SSH nur aus Admin-Netzen; PostgreSQL nur über das private Netz"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_netze
  }
}

resource "hcloud_server" "app" {
  name               = "${local.name}-app"
  server_type        = var.app_servertyp
  image              = "ubuntu-24.04"
  location           = var.standort
  ssh_keys           = [for k in hcloud_ssh_key.admin : k.id]
  firewall_ids       = [hcloud_firewall.app.id]
  backups            = var.server_backups
  delete_protection  = var.loeschschutz
  rebuild_protection = var.loeschschutz
  labels             = merge(local.labels, { rolle = "app" })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.netz.id
    ip         = local.app_privat
  }

  depends_on = [hcloud_network_subnet.subnetz]
}

resource "hcloud_server" "db" {
  name               = "${local.name}-db"
  server_type        = var.db_servertyp
  image              = "ubuntu-24.04"
  location           = var.standort
  ssh_keys           = [for k in hcloud_ssh_key.admin : k.id]
  firewall_ids       = [hcloud_firewall.db.id]
  backups            = var.server_backups
  delete_protection  = var.loeschschutz
  rebuild_protection = var.loeschschutz
  labels             = merge(local.labels, { rolle = "db" })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.netz.id
    ip         = local.db_privat
  }

  depends_on = [hcloud_network_subnet.subnetz]
}

# Daten der Datenbank auf eigenem Datenträger: ein Serverwechsel oder
# -neuaufbau lässt sie unberührt.
resource "hcloud_volume" "db" {
  name              = "${local.name}-db-daten"
  size              = var.db_volume_gb
  location          = var.standort
  format            = "ext4"
  delete_protection = var.loeschschutz
  labels            = local.labels
}

resource "hcloud_volume_attachment" "db" {
  volume_id = hcloud_volume.db.id
  server_id = hcloud_server.db.id
  automount = false # Ansible hängt ihn gezielt unter /var/lib/postgresql ein
}

# Feste Adresse für Kunden-Domains ohne www (A-/AAAA-Eintrag). Beim Wechsel
# des Anwendungsservers wird nur die Zuordnung geändert, nie die Adresse.
resource "hcloud_floating_ip" "v4" {
  count             = var.floating_ip ? 1 : 0
  name              = "${local.name}-v4"
  type              = "ipv4"
  home_location     = var.standort
  delete_protection = var.loeschschutz
  labels            = local.labels
}

resource "hcloud_floating_ip" "v6" {
  count             = var.floating_ip ? 1 : 0
  name              = "${local.name}-v6"
  type              = "ipv6"
  home_location     = var.standort
  delete_protection = var.loeschschutz
  labels            = local.labels
}

resource "hcloud_floating_ip_assignment" "v4" {
  count          = var.floating_ip ? 1 : 0
  floating_ip_id = hcloud_floating_ip.v4[0].id
  server_id      = hcloud_server.app.id
}

resource "hcloud_floating_ip_assignment" "v6" {
  count          = var.floating_ip ? 1 : 0
  floating_ip_id = hcloud_floating_ip.v6[0].id
  server_id      = hcloud_server.app.id
}

# Kennwörter der drei Datenbankrollen (Eigentümer, Anwendung, Plattform).
# Sie entstehen hier, stehen im Terraform-Zustand (privater Bucket) und
# gehen von dort nur an Ansible — nie ins Repository, nie in einen Chat.
resource "random_password" "db" {
  for_each = toset(["eigentuemer", "app", "plattform"])
  length   = 40
  special  = false
}

resource "local_sensitive_file" "ansible_inventar" {
  filename        = var.ansible_inventar_pfad
  file_permission = "0600"
  content = yamlencode({
    all = {
      vars = {
        umgebung                = var.umgebung
        ansible_user            = "root"
        app_privat_ip           = local.app_privat
        db_privat_ip            = local.db_privat
        floating_ipv4           = var.floating_ip ? hcloud_floating_ip.v4[0].ip_address : ""
        floating_ipv6           = var.floating_ip ? hcloud_floating_ip.v6[0].ip_address : ""
        db_volume_linux_device  = hcloud_volume.db.linux_device
        db_kennwort_eigentuemer = random_password.db["eigentuemer"].result
        db_kennwort_app         = random_password.db["app"].result
        db_kennwort_plattform   = random_password.db["plattform"].result
      }
      children = {
        app = { hosts = { (hcloud_server.app.name) = { ansible_host = hcloud_server.app.ipv4_address } } }
        db  = { hosts = { (hcloud_server.db.name) = { ansible_host = hcloud_server.db.ipv4_address } } }
      }
    }
  })
}
