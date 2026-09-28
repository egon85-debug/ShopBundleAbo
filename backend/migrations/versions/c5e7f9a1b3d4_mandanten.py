"""Mandantenfähigkeit: Firmen, Mitgliedschaften, tenant_id und Row Level Security

Alle bestehenden Daten gehören danach Kunde Nr. 1 (Winterfeld Logistik).

Ausnahme von der Regel „Migrationen sind rückwärtskompatibel“: Nach dieser
Migration kann die Vorgängerversion zwar noch lesen und sich anmelden
(`users.role` bleibt, jetzt nullable), aber keine neuen Datensätze mehr
speichern — ihr fehlt `tenant_id`. Einspielen deshalb mit kurzer Wartung
(alte Version stoppen, migrieren, neue Version starten); vorgesehen im
Umzug von Kunde Nr. 1 (Phase B). `users.role` entfällt in einer späteren
Migration.

Nur für PostgreSQL (Row Level Security gibt es in SQLite nicht; die Tests mit
SQLite legen das Schema direkt aus den Modellen an).

Revision ID: c5e7f9a1b3d4
Revises: b4d2f6a8c0e1
Create Date: 2026-09-28 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = "c5e7f9a1b3d4"
down_revision = "b4d2f6a8c0e1"
branch_labels = None
depends_on = None

WINTERFELD_ID = "00000000-0000-4000-8000-000000000001"

# Stand dieser Migration — bewusst fest und nicht aus den Modellen gelesen,
# damit spätere Modelländerungen diese Migration nicht verändern.
MANDANTEN_TABELLEN = [
    "ai_runs", "audit_log", "counters", "idempotency_keys", "jobs", "price_quotes",
    "price_research_runs", "price_sources", "product_images", "products",
    "shop_connections", "shop_listings", "shop_publications", "stock_movements",
    "storage_locations", "suppliers", "voice_recordings",
]

# (Tabelle, alte Eindeutigkeit, Art, Spalte, neuer Name)
EINDEUTIG = [
    ("price_sources", "price_sources_name_key", "constraint", "name",
     "uq_price_sources_tenant_name"),
    ("shop_connections", "shop_connections_name_key", "constraint", "name",
     "uq_shop_connections_tenant_name"),
    ("storage_locations", "storage_locations_qr_code_value_key", "constraint", "qr_code_value",
     "uq_storage_locations_tenant_qr"),
    ("storage_locations", "ix_storage_locations_code", "index", "code",
     "uq_storage_locations_tenant_code"),
    ("suppliers", "ix_suppliers_name", "index", "name", "uq_suppliers_tenant_name"),
    ("idempotency_keys", "ix_idempotency_keys_key", "index", "key",
     "uq_idempotency_keys_tenant_key"),
    ("products", "ix_products_internal_sku", "index", "internal_sku",
     "uq_products_tenant_internal_sku"),
    ("products", "ix_products_client_capture_id", "index", "client_capture_id",
     "uq_products_tenant_client_capture_id"),
]

POLICY = "mandantentrennung"
BEDINGUNG = "tenant_id = current_setting('app.tenant_id', true)"


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("Diese Migration benötigt PostgreSQL.")

    op.create_table(
        "tenants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kurzname", sa.String(63), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("sku_praefix", sa.String(8), nullable=False),
        sa.Column("warteschlange_bedient_am", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tenants_kurzname", "tenants", ["kurzname"], unique=True)
    op.execute(
        "INSERT INTO tenants (id, name, kurzname, status, sku_praefix, created_at, updated_at) "
        f"VALUES ('{WINTERFELD_ID}', 'Winterfeld Logistik', 'winterfeld', 'aktiv', 'WL', "
        "now(), now())")

    op.create_table(
        "memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(36),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_memberships_user_tenant"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_tenant_id", "memberships", ["tenant_id"])
    # Jedes bestehende Konto gehört mit seiner bisherigen Rolle zu Winterfeld.
    # gen_random_uuid() ist ab PostgreSQL 13 eingebaut.
    op.execute(
        "INSERT INTO memberships (id, user_id, tenant_id, role, is_active, created_at, "
        "updated_at) SELECT gen_random_uuid()::text, id, "
        f"'{WINTERFELD_ID}', role, true, now(), now() FROM users")

    op.alter_column("users", "role", existing_type=sa.String(32), nullable=True)
    op.add_column("users", sa.Column("ist_plattform_admin", sa.Boolean(), nullable=False,
                                     server_default=sa.false()))
    op.add_column("refresh_tokens", sa.Column(
        "tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE")))
    op.execute(f"UPDATE refresh_tokens SET tenant_id = '{WINTERFELD_ID}'")

    for tabelle in MANDANTEN_TABELLEN:
        op.add_column(tabelle, sa.Column("tenant_id", sa.String(36), nullable=True))
        op.execute(f"UPDATE {tabelle} SET tenant_id = '{WINTERFELD_ID}'")
        op.alter_column(tabelle, "tenant_id", nullable=False)
        op.create_foreign_key(f"fk_{tabelle}_tenant_id", tabelle, "tenants",
                              ["tenant_id"], ["id"], ondelete="RESTRICT")
        if tabelle != "counters":  # dort Teil des Primärschlüssels
            op.create_index(f"ix_{tabelle}_tenant_id", tabelle, ["tenant_id"])

    # Eindeutig je Firma statt weltweit.
    for tabelle, alt, art, spalte, neu in EINDEUTIG:
        if art == "constraint":
            op.drop_constraint(alt, tabelle, type_="unique")
        else:
            op.drop_index(alt, table_name=tabelle)
            op.create_index(alt, tabelle, [spalte])
        op.create_unique_constraint(neu, tabelle, ["tenant_id", spalte])

    # Zähler (SKU-Nummern) laufen je Firma.
    op.drop_constraint("counters_pkey", "counters", type_="primary")
    op.create_primary_key("counters_pkey", "counters", ["tenant_id", "name"])

    # Zweite Sicherung: die Datenbank selbst gibt nur Zeilen der Firma heraus,
    # die die Anwendung zu Beginn der Transaktion in app.tenant_id setzt.
    # FORCE gilt auch für den Eigentümer der Tabellen. Nicht betroffen sind
    # Superuser und Rollen mit BYPASSRLS (die Plattform-Rolle).
    for tabelle in MANDANTEN_TABELLEN:
        op.execute(f"ALTER TABLE {tabelle} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {tabelle} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY {POLICY} ON {tabelle} "
                   f"USING ({BEDINGUNG}) WITH CHECK ({BEDINGUNG})")


def downgrade() -> None:
    for tabelle in MANDANTEN_TABELLEN:
        op.execute(f"DROP POLICY IF EXISTS {POLICY} ON {tabelle}")
        op.execute(f"ALTER TABLE {tabelle} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {tabelle} DISABLE ROW LEVEL SECURITY")

    # Rückweg nur, solange es genau eine Firma gibt — sonst würden Daten
    # verschiedener Händler ununterscheidbar zusammenfallen.
    anzahl = op.get_bind().execute(sa.text("SELECT count(*) FROM tenants")).scalar()
    if anzahl and anzahl > 1:
        raise RuntimeError("Rückweg nicht möglich: mehr als eine Firma vorhanden.")

    op.drop_constraint("counters_pkey", "counters", type_="primary")
    op.create_primary_key("counters_pkey", "counters", ["name"])
    for tabelle, alt, art, spalte, neu in reversed(EINDEUTIG):
        op.drop_constraint(neu, tabelle, type_="unique")
        if art == "constraint":
            op.create_unique_constraint(alt, tabelle, [spalte])
        else:
            op.drop_index(alt, table_name=tabelle)
            op.create_index(alt, tabelle, [spalte], unique=True)
    for tabelle in MANDANTEN_TABELLEN:
        if tabelle != "counters":
            op.drop_index(f"ix_{tabelle}_tenant_id", table_name=tabelle)
        op.drop_constraint(f"fk_{tabelle}_tenant_id", tabelle, type_="foreignkey")
        op.drop_column(tabelle, "tenant_id")

    op.drop_column("refresh_tokens", "tenant_id")
    op.drop_column("users", "ist_plattform_admin")
    op.execute("UPDATE users SET role = m.role FROM memberships m "
               "WHERE m.user_id = users.id AND users.role IS NULL")
    op.execute("UPDATE users SET role = 'employee' WHERE role IS NULL")
    op.alter_column("users", "role", existing_type=sa.String(32), nullable=False)
    op.drop_table("memberships")
    op.drop_table("tenants")
