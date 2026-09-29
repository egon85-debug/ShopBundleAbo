output "app_ipv4" {
  description = "Öffentliche Adresse des Anwendungsservers (nur für Verwaltung)."
  value       = hcloud_server.app.ipv4_address
}

output "floating_ipv4" {
  description = "Feste Adresse für Kunden-Domains (A-Eintrag)."
  value       = var.floating_ip ? hcloud_floating_ip.v4[0].ip_address : null
}

output "floating_ipv6" {
  description = "Feste Adresse für Kunden-Domains (AAAA-Eintrag)."
  value       = var.floating_ip ? hcloud_floating_ip.v6[0].ip_address : null
}

output "db_ipv4" {
  value = hcloud_server.db.ipv4_address
}
