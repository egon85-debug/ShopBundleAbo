-- Rechte der Datenbankrollen der Plattform.
--
-- Drei Rollen (angelegt von der Server-Einrichtung, Kennwörter nie im Repository):
--
--   <eigentuemer>  besitzt die Tabellen, führt Migrationen aus. Kein Zugriff
--                  von der Anwendung aus.
--   <app>          API und Job-Handler. NOBYPASSRLS: sieht nur Zeilen des
--                  Mandanten, den die Anwendung je Transaktion in
--                  app.tenant_id setzt (Row Level Security).
--   <plattform>    Aufgaben über alle Mandanten (Warteschlange verteilen,
--                  Webhooks zuordnen). BYPASSRLS. Nur DATABASE_URL_PLATTFORM.
--
-- Aufruf nach jeder Migration als Eigentümer, z. B.:
--   psql "$EIGENTUEMER_URL" -v app=wf_app -v plattform=wf_plattform \
--        -f deploy/datenbank-rechte.sql
-- Wiederholbar.

GRANT USAGE ON SCHEMA public TO :"app", :"plattform";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app", :"plattform";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app", :"plattform";
-- Die Versionstabelle der Migrationen gehört nur dem Eigentümer.
REVOKE INSERT, UPDATE, DELETE ON alembic_version FROM :"app", :"plattform";
-- Tabellen, die spätere Migrationen anlegen, bekommen dieselben Rechte.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app", :"plattform";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app", :"plattform";
