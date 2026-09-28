# Infrastruktur: Server bei Hetzner per Code

Stand: Phase A, Schritt 3 (28.09.2026).

Alles, was die Plattform an Servern braucht, steht als Code im Repository. Eine Umgebung
lässt sich damit jederzeit gleich wieder aufbauen: nach einem Ausfall, für einen
Serverwechsel oder für Staging.

| Ordner | Werkzeug | Aufgabe |
|---|---|---|
| `infra/terraform/` | Terraform | **legt an**: Netz, Server, Datenträger, feste IP, Firewall |
| `infra/ansible/` | Ansible | **richtet ein**: Sicherheit, PostgreSQL mit drei Rollen, Sicherung, Anwendung |
| `.github/workflows/infra-*.yml` | GitHub Actions | prüfen bei jeder Änderung; anwenden per Knopfdruck |
| `.github/workflows/backend-image.yml` | GitHub Actions | baut das Backend-Image (`ghcr.io/…/winterfeld-backend`) |

## Aufbau einer Umgebung

```
Internet ── feste IP (Floating IP) ──▶ Anwendungsserver ──(privates Netz 10.20.1.0/24)──▶ Datenbankserver
                                       Caddy, API, Worker                                   PostgreSQL 17
                                                                                            └─ eigener Datenträger
                                                  └──────────── Hetzner Object Storage ◀──────────┘
                                                                Bilder · verschlüsselte Sicherung
```

| | Staging | Produktion |
|---|---|---|
| Anwendungsserver | CX23 | CX33 |
| Datenbankserver | CX23 | CX33 |
| Datenträger Datenbank | 10 GB | 40 GB |
| Feste IP für Kunden-Domains | – | ja (IPv4 + IPv6) |
| Löschschutz | aus | an |
| Server-Abbilder von Hetzner | aus | an |
| Adresse | `app.staging.eg-dynamics.de`, `noindex` | `app.eg-dynamics.de` |

Größen ändern: nur in `infra/terraform/umgebungen/<umgebung>/main.tf`.

## Sicherheit

- **Hetzner-Firewall + Server-Firewall** (doppelt): öffentlich nur 80/443; SSH nur aus
  festgelegten Netzen und nur mit Schlüssel. Die Datenbank ist von außen gar nicht
  erreichbar, nur über das private Netz und nur vom Anwendungsserver.
- **Drei Datenbankrollen**: Eigentümer (nur Migrationen), Anwendung (ohne BYPASSRLS —
  Row Level Security greift), Plattform (mit BYPASSRLS, nur Warteschlange/Webhooks).
  Kennwörter erzeugt Terraform zufällig; sie stehen im Terraform-Zustand (privater
  Bucket) und in einer Datei nur für root auf dem Anwendungsserver — nie im Repository.
- **Sicherung** (pgBackRest): laufende Archivierung der Änderungen (Wiederherstellung
  auf jede Minute), Vollsicherung sonntags, Differenz täglich, zwei Vollsicherungen
  bleiben. Alles **verschlüsselt** im Object Storage. Ohne die Passphrase
  `WF_SICHERUNG_PASSPHRASE` ist die Sicherung wertlos — **sie muss zusätzlich an einem
  sicheren Ort außerhalb von GitHub liegen** (z. B. Passwortmanager).
- Automatische Sicherheitsupdates, fail2ban, Container-Protokolle begrenzt.

## Einmalig von dir zu erledigen

Ich führe nichts bei Hetzner aus und bekomme keine Schlüssel. Du legst an und trägst die
Werte in GitHub ein. Die Werte gibst du **nie** in einen Chat.

1. **Hetzner-Projekt** anlegen (console.hetzner.com → „Neues Projekt“, Name z. B.
   `eg-dynamics`).
2. **API-Token**: im Projekt → Sicherheit → API-Tokens → „Lesen & Schreiben“.
3. **Object Storage**: drei Buckets anlegen, alle **privat**, Standort Falkenstein:
   `eg-dynamics-terraform`, `eg-dynamics-medien-staging`, `eg-dynamics-sicherung-staging`
   (für die Produktion später dieselben mit `-produktion`). Dann unter
   „S3-Zugangsdaten“ einen Zugang erzeugen (Access Key + Secret Key).
4. **SSH-Schlüssel** für die Server erzeugen (einmalig, z. B. mit `ssh-keygen -t ed25519`
   oder ich erkläre es dir Schritt für Schritt).
5. **GitHub-Umgebung** anlegen: Repository → Settings → Environments → `staging`.
   Für `produktion` zusätzlich „Required reviewers: du selbst“ — dann läuft nichts in
   Produktion ohne deine Bestätigung.
6. **Geheimnisse** in der Umgebung eintragen (Environment secrets):

| Name | Inhalt |
|---|---|
| `HCLOUD_TOKEN` | API-Token aus Schritt 2 |
| `WF_S3_ACCESS_KEY`, `WF_S3_SECRET_KEY` | S3-Zugang aus Schritt 3 |
| `WF_SICHERUNG_PASSPHRASE` | lange Zufallsfolge (z. B. 40 Zeichen); **zusätzlich sicher aufbewahren** |
| `WF_JWT_SECRET` | lange Zufallsfolge (64 Zeichen) |
| `WF_CREDENTIALS_KEY` | Fernet-Schlüssel (Befehl in `docs/deployment-backend.md`) — **nie mehr ändern** |
| `WF_ANTHROPIC_API_KEY` | KI-Schlüssel der Plattform |
| `WF_GHCR_TOKEN` | GitHub-Token nur mit „read:packages“ (damit der Server das Image laden darf) |
| `SSH_PRIVATER_SCHLUESSEL` | privater Teil aus Schritt 4 |
| `SSH_OEFFENTLICHE_SCHLUESSEL` | `{"admin": "ssh-ed25519 AAAA… name"}` (öffentlicher Teil) |

   Optional als Variable (nicht geheim): `ADMIN_NETZE` — eigene feste IP-Adressen mit
   SSH-Zugang, kommagetrennt (z. B. `203.0.113.10/32`). Der GitHub-Runner bekommt bei
   jedem Lauf automatisch seine eigene Adresse dazu.

## Ausführen

GitHub → Actions → **Infrastruktur anwenden** → „Run workflow“:

1. Umgebung `staging`, Schritt **planen** → im Protokoll steht, was angelegt würde.
2. Stimmt das, dasselbe mit **anwenden**. Terraform legt die Server an, Ansible richtet
   sie ein, spielt die Migrationen ein und startet die Anwendung.
3. DNS: `app.staging.eg-dynamics.de` als A-Eintrag auf die Adresse des
   Anwendungsservers (steht im Protokoll unter `app_ipv4`). Danach holt Caddy das
   Zertifikat selbst.

Wiederholen ist gefahrlos: Beide Werkzeuge ändern nur, was abweicht.

Lokal (für Entwickler) geht dasselbe mit `terraform -chdir=infra/terraform/umgebungen/staging
apply` und `ansible-playbook -i inventar/staging.yml site.yml` im Ordner `infra/ansible`,
mit denselben Werten als Umgebungsvariablen.

## Was geprüft ist — und was nicht

- Bei jeder Änderung (CI): `terraform fmt`/`validate` für beide Umgebungen,
  `ansible-lint` im strengsten Profil („production“).
- Lokal zusätzlich: Probe-Planung der Produktion (17 Bausteine), Erzeugen aller
  Konfigurationsdateien aus den Vorlagen, Abbruch des Laufs, wenn ein Geheimnis fehlt.
- **Noch nicht** gegen echte Hetzner-Server gelaufen — das geht erst mit deinem Projekt
  und Token. Beim ersten Lauf auf Staging bleibe ich dabei und behebe, was hakt.

## Nächste Schritte

- Update-Pipeline: nach grünen Tests automatisch auf Staging, Produktion per Freigabe,
  ohne Ausfall.
- Monatliche Test-Wiederherstellung der Sicherung auf einem frischen Server mit
  Zahlenabgleich.
- Überwachung und Alarme (Phase G), Shop auf die Plattform (eigener Schritt).
