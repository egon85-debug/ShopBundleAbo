variable "umgebung" {
  description = "staging oder produktion — steht in jedem Namen und Label."
  type        = string
  validation {
    condition     = contains(["staging", "produktion"], var.umgebung)
    error_message = "umgebung muss staging oder produktion sein."
  }
}

variable "standort" {
  description = "Hetzner-Rechenzentrum (fsn1 Falkenstein, nbg1 Nürnberg)."
  type        = string
  default     = "fsn1"
}

variable "app_servertyp" {
  description = "Anwendungsserver (Caddy, API, Worker, Shop)."
  type        = string
}

variable "db_servertyp" {
  description = "Datenbankserver (PostgreSQL)."
  type        = string
}

variable "db_volume_gb" {
  description = "Größe des Datenträgers für die Datenbank in GB (wächst per Änderung mit)."
  type        = number
  default     = 20
}

variable "ssh_schluessel" {
  description = "Öffentliche SSH-Schlüssel der Admins (Name → Schlüssel). Nie private Schlüssel!"
  type        = map(string)
}

variable "admin_netze" {
  description = "IP-Bereiche, von denen SSH erlaubt ist (z. B. die Adresse des CI-Runners oder Büros)."
  type        = list(string)
}

variable "floating_ip" {
  description = "Feste IP für Kunden-Domains anlegen (Produktion: ja)."
  type        = bool
  default     = true
}

variable "loeschschutz" {
  description = "Server, Datenträger und feste IP gegen versehentliches Löschen sperren."
  type        = bool
  default     = true
}

variable "server_backups" {
  description = "Tägliche Server-Abbilder von Hetzner (+20 % Serverpreis). Ersetzt nicht pgBackRest."
  type        = bool
  default     = false
}

variable "ansible_inventar_pfad" {
  description = "Wohin das Ansible-Inventar geschrieben wird."
  type        = string
}
