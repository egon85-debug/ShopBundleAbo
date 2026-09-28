"""Mandantentrennung in der Datenbank: Migration und Row Level Security.

Läuft gegen eine echte PostgreSQL (ab 13). Die Adresse eines Superusers kommt
aus WF_TEST_POSTGRES, z. B.

    WF_TEST_POSTGRES="postgresql+psycopg2://postgres@/postgres?host=/tmp&port=5433" \\
        pytest -m integration tests/test_mandanten_postgres.py

Der Test legt eine frische Datenbank und drei Rollen an (wie in Produktion:
Eigentümer, Anwendung ohne BYPASSRLS, Plattform mit BYPASSRLS), spielt die
Migrationen mit Altdaten aus der Zeit vor der Mandantenfähigkeit ein und prüft,
dass die Datenbank selbst fremde Zeilen verweigert — auch wenn der
Anwendungscode den Mandantenfilter vergäße.
"""
import os
import secrets
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

from app import db as app_db
from app.models import WINTERFELD_ID

pytestmark = pytest.mark.integration

SUPERUSER_URL = os.environ.get("WF_TEST_POSTGRES")
BACKEND = Path(__file__).resolve().parent.parent
ROLLEN = {"eigentuemer": "wf_test_eigentuemer", "app": "wf_test_app",
          "plattform": "wf_test_plattform"}
VOR_MANDANTEN = "b4d2f6a8c0e1"
MANDANT_B = "20000000-0000-4000-8000-000000000002"
# Zufällig je Lauf; nötig, wenn die Test-Datenbank Kennwörter verlangt (CI).
KENNWORT = secrets.token_hex(16)

if not SUPERUSER_URL:
    pytest.skip("WF_TEST_POSTGRES nicht gesetzt", allow_module_level=True)


def _url(datenbank: str, rolle: str | None = None) -> str:
    url = make_url(SUPERUSER_URL).set(database=datenbank)
    if rolle:
        url = url.set(username=rolle, password=KENNWORT)
    return url.render_as_string(hide_password=False)


@pytest.fixture(scope="module")
def datenbank():
    name = f"wf_mandanten_{secrets.token_hex(4)}"
    admin = create_engine(SUPERUSER_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        for art, rolle in ROLLEN.items():
            if not c.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": rolle}):
                c.execute(text(f'CREATE ROLE "{rolle}" LOGIN'))
            c.execute(text(f'ALTER ROLE "{rolle}" PASSWORD \'{KENNWORT}\''))
        c.execute(text(f'ALTER ROLE "{ROLLEN["app"]}" NOBYPASSRLS NOSUPERUSER'))
        c.execute(text(f'ALTER ROLE "{ROLLEN["plattform"]}" BYPASSRLS NOSUPERUSER'))
        c.execute(text(f'CREATE DATABASE "{name}" OWNER "{ROLLEN["eigentuemer"]}"'))
    with create_engine(_url(name), isolation_level="AUTOCOMMIT").connect() as c:
        c.execute(text(f'ALTER SCHEMA public OWNER TO "{ROLLEN["eigentuemer"]}"'))
    yield name
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


def _alembic(url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture(scope="module")
def migriert(datenbank):
    """Schema vor der Mandantenfähigkeit + Altdaten, dann Migration auf den neuesten Stand."""
    eigentuemer_url = _url(datenbank, ROLLEN["eigentuemer"])
    command.upgrade(_alembic(eigentuemer_url), VOR_MANDANTEN)
    eigentuemer = create_engine(eigentuemer_url)
    with eigentuemer.begin() as c:
        c.execute(text(
            "INSERT INTO users (id, email, password_hash, display_name, role, is_active, "
            "created_at, updated_at) VALUES ('u-alt', 'chef@winterfeld.de', 'x', 'Chef', "
            "'admin', true, now(), now())"))
        c.execute(text(
            "INSERT INTO suppliers (id, name, created_at, updated_at) "
            "VALUES ('s-alt', 'Müller Großhandel', now(), now())"))
        c.execute(text(
            "INSERT INTO products (id, internal_sku, attributes, technical_data, condition, "
            "stock_quantity, reserved_quantity, field_confidence, field_sources, "
            "open_questions, research_candidates, processing_status, publication_status, "
            "product_name, created_at, updated_at) VALUES ('p-alt', 'WL-000007', '{}', '{}', "
            "'new', 3, 0, '{}', '{}', '[]', '[]', 'shop_ready', 'draft', 'Altartikel', "
            "now(), now())"))
        c.execute(text("INSERT INTO counters (name, value) VALUES ('internal_sku', 7)"))
        c.execute(text(
            "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, "
            "updated_at) VALUES ('r-alt', 'u-alt', 'h', now() + interval '1 day', now(), now())"))
    command.upgrade(_alembic(eigentuemer_url), "head")
    rechte = (BACKEND / "deploy" / "datenbank-rechte.sql").read_text()
    rechte = "\n".join(z for z in rechte.splitlines() if not z.startswith("--"))
    rechte = (rechte.replace(':"app"', f'"{ROLLEN["app"]}"')
              .replace(':"plattform"', f'"{ROLLEN["plattform"]}"'))
    with eigentuemer.begin() as c:
        for anweisung in filter(str.strip, rechte.split(";")):
            c.execute(text(anweisung))
    yield datenbank
    eigentuemer.dispose()


@pytest.fixture(scope="module")
def engines(migriert):
    app_engine = create_engine(_url(migriert, ROLLEN["app"]))
    plattform_engine = create_engine(_url(migriert, ROLLEN["plattform"]))
    eigentuemer_engine = create_engine(_url(migriert, ROLLEN["eigentuemer"]))
    with plattform_engine.begin() as c:
        c.execute(text(
            "INSERT INTO tenants (id, name, kurzname, status, sku_praefix, created_at, "
            f"updated_at) VALUES ('{MANDANT_B}', 'Firma B', 'firma-b', 'aktiv', 'FB', now(), "
            "now())"))
        c.execute(text(
            "INSERT INTO suppliers (id, tenant_id, name, notes, created_at, updated_at) "
            f"VALUES ('s-b', '{MANDANT_B}', 'Müller Großhandel', 'GEHEIM-B', now(), now())"))
    yield {"app": app_engine, "plattform": plattform_engine, "eigentuemer": eigentuemer_engine}
    for e in (app_engine, plattform_engine, eigentuemer_engine):
        e.dispose()


def _mit_mandant(conn, tenant_id):
    conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})


# ── Migration ──────────────────────────────────────────────────────────────

class TestMigration:
    def test_altdaten_gehoeren_winterfeld(self, engines):
        with engines["plattform"].connect() as c:
            for tabelle in ("products", "suppliers", "counters"):
                fremd = c.scalar(text(
                    f"SELECT count(*) FROM {tabelle} WHERE tenant_id <> :w"), {"w": WINTERFELD_ID})
                assert fremd == 0 or tabelle == "suppliers"
            assert c.scalar(text("SELECT tenant_id FROM products WHERE id = 'p-alt'")) \
                == WINTERFELD_ID
            assert c.scalar(text("SELECT sku_praefix FROM tenants WHERE id = :w"),
                            {"w": WINTERFELD_ID}) == "WL"
            rolle = c.scalar(text("SELECT role FROM memberships WHERE user_id = 'u-alt' "
                                  "AND tenant_id = :w"), {"w": WINTERFELD_ID})
            assert rolle == "admin"
            assert c.scalar(text("SELECT tenant_id FROM refresh_tokens WHERE id = 'r-alt'")) \
                == WINTERFELD_ID

    def test_gleicher_lieferant_in_zwei_firmen_erlaubt(self, engines):
        with engines["plattform"].connect() as c:
            assert c.scalar(text(
                "SELECT count(*) FROM suppliers WHERE name = 'Müller Großhandel'")) == 2

    def test_eindeutig_innerhalb_einer_firma(self, engines):
        with engines["app"].connect() as c:
            with c.begin():
                _mit_mandant(c, MANDANT_B)
                with pytest.raises(DBAPIError):
                    c.execute(text(
                        "INSERT INTO suppliers (id, tenant_id, name, created_at, updated_at) "
                        f"VALUES ('s-b2', '{MANDANT_B}', 'Müller Großhandel', now(), now())"))


# ── Row Level Security ─────────────────────────────────────────────────────

class TestRowLevelSecurity:
    def test_jede_tabelle_mit_tenant_id_ist_geschuetzt(self, engines):
        """Eine neue Tabelle ohne Regel lässt diesen Test scheitern."""
        with engines["eigentuemer"].connect() as c:
            tabellen = c.scalars(text(
                "SELECT table_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND column_name = 'tenant_id' "
                "AND table_name NOT IN ('memberships', 'refresh_tokens')")).all()
            assert len(tabellen) >= 17
            for tabelle in tabellen:
                an, erzwungen = c.execute(text(
                    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class "
                    "WHERE relname = :t AND relnamespace = 'public'::regnamespace"),
                    {"t": tabelle}).one()
                regeln = c.scalar(text(
                    "SELECT count(*) FROM pg_policies WHERE tablename = :t"), {"t": tabelle})
                assert an and erzwungen and regeln >= 1, tabelle

    def test_anwendung_sieht_modell_und_datenbank_uebereinstimmend(self, engines):
        """Alle Modelle mit TenantMixin sind in der Datenbank geschützt."""
        from app.tenancy import mandanten_tabellen
        with engines["eigentuemer"].connect() as c:
            geschuetzt = set(c.scalars(text("SELECT tablename FROM pg_policies")).all())
        assert set(mandanten_tabellen()) <= geschuetzt

    def test_ohne_mandant_sieht_die_anwendung_nichts(self, engines):
        with engines["app"].connect() as c:
            assert c.scalar(text("SELECT count(*) FROM products")) == 0
            assert c.scalar(text("SELECT count(*) FROM suppliers")) == 0

    def test_auch_der_eigentuemer_ist_nicht_ausgenommen(self, engines):
        with engines["eigentuemer"].connect() as c:
            assert c.scalar(text("SELECT count(*) FROM suppliers")) == 0

    def test_mit_mandant_nur_eigene_zeilen(self, engines):
        with engines["app"].connect() as c:
            with c.begin():
                _mit_mandant(c, MANDANT_B)
                assert c.scalars(text("SELECT notes FROM suppliers")).all() == ["GEHEIM-B"]
                assert c.scalar(text("SELECT count(*) FROM products")) == 0

    def test_fremde_zeilen_schreiben_wird_verweigert(self, engines):
        with engines["app"].connect() as c:
            with c.begin():
                _mit_mandant(c, MANDANT_B)
                with pytest.raises(DBAPIError):
                    c.execute(text(
                        "INSERT INTO suppliers (id, tenant_id, name, created_at, updated_at) "
                        f"VALUES ('s-x', '{WINTERFELD_ID}', 'Unterschoben', now(), now())"))
        with engines["app"].connect() as c:
            with c.begin():
                _mit_mandant(c, MANDANT_B)
                geaendert = c.execute(text(
                    "UPDATE products SET notes = 'von B' WHERE id = 'p-alt'")).rowcount
                assert geaendert == 0

    def test_mandant_gilt_nur_fuer_die_transaktion(self, engines):
        with engines["app"].connect() as c:
            with c.begin():
                _mit_mandant(c, MANDANT_B)
                assert c.scalar(text("SELECT count(*) FROM suppliers")) == 1
            assert c.scalar(text("SELECT count(*) FROM suppliers")) == 0

    def test_plattform_rolle_sieht_alles(self, engines):
        with engines["plattform"].connect() as c:
            assert c.scalar(text("SELECT count(*) FROM suppliers")) == 2


# ── Anwendung gegen PostgreSQL ─────────────────────────────────────────────

class TestAnwendung:
    @pytest.fixture()
    def anwendung(self, engines):
        app_db.set_engine(engines["app"], engines["plattform"])
        yield
        with engines["plattform"].begin() as c:
            c.execute(text("DELETE FROM jobs"))

    def test_sitzung_setzt_mandanten_fuer_rls(self, anwendung):
        from sqlalchemy import select

        from app.models import Supplier
        from app.tenancy import mandant_setzen
        db = app_db.get_sessionmaker()()
        # Zuerst ohne Mandant eine Transaktion öffnen (wie get_current_user),
        # dann mitten darin den Mandanten setzen.
        assert db.scalars(select(Supplier)).all() == []
        mandant_setzen(db, MANDANT_B)
        assert [s.notes for s in db.scalars(select(Supplier))] == ["GEHEIM-B"]
        db.commit()
        # Nach dem Commit beginnt eine neue Transaktion — der Mandant bleibt.
        assert len(db.scalars(select(Supplier)).all()) == 1
        db.close()

    def test_rls_greift_auch_ohne_anwendungsfilter(self, anwendung):
        """Zweite Sicherung: selbst ohne ORM-Filter liefert die Datenbank nur B."""
        from sqlalchemy import select

        from app.models import Supplier
        from app.tenancy import mandant_setzen
        db = app_db.get_sessionmaker()()
        mandant_setzen(db, MANDANT_B)
        alle = db.scalars(select(Supplier).execution_options(ohne_mandantenfilter=True)).all()
        assert [s.tenant_id for s in alle] == [MANDANT_B]
        db.close()

    def test_worker_verteilt_ueber_alle_firmen(self, anwendung):
        from app.jobs import handlers, queue
        from app.jobs.worker import Worker
        from app.tenancy import mandant_setzen
        for tenant_id in (WINTERFELD_ID, MANDANT_B):
            db = app_db.get_sessionmaker()()
            mandant_setzen(db, tenant_id)
            queue.enqueue(db, job_type="cleanup_voice")
            db.commit()
            db.close()
        gesehen = []
        alt = handlers.HANDLERS["cleanup_voice"]
        handlers.HANDLERS["cleanup_voice"] = lambda db, job: gesehen.append(job.tenant_id)
        try:
            assert Worker("w").process_one() and Worker("w").process_one()
            assert not Worker("w").process_one()
        finally:
            handlers.HANDLERS["cleanup_voice"] = alt
        assert sorted(gesehen) == sorted([WINTERFELD_ID, MANDANT_B])


# ── Rückweg ────────────────────────────────────────────────────────────────

def test_migration_laesst_sich_zuruecknehmen(datenbank):
    """Rückweg für den Umzug: solange es nur eine Firma gibt, stellt die
    Rücknahme den alten Zustand her (Rollen wieder am Konto)."""
    name = f"{datenbank}_rueck"
    admin = create_engine(SUPERUSER_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}" OWNER "{ROLLEN["eigentuemer"]}"'))
    with create_engine(_url(name), isolation_level="AUTOCOMMIT").connect() as c:
        c.execute(text(f'ALTER SCHEMA public OWNER TO "{ROLLEN["eigentuemer"]}"'))
    try:
        url = _url(name, ROLLEN["eigentuemer"])
        command.upgrade(_alembic(url), VOR_MANDANTEN)
        e = create_engine(url)
        with e.begin() as c:
            c.execute(text(
                "INSERT INTO users (id, email, password_hash, display_name, role, is_active, "
                "created_at, updated_at) VALUES ('u', 'a@b.de', 'x', 'A', 'shop_manager', "
                "true, now(), now())"))
        command.upgrade(_alembic(url), "head")
        command.downgrade(_alembic(url), VOR_MANDANTEN)
        with e.connect() as c:
            assert c.scalar(text("SELECT role FROM users WHERE id = 'u'")) == "shop_manager"
            assert c.scalar(text(
                "SELECT count(*) FROM information_schema.tables WHERE table_name = 'tenants'")) == 0
        e.dispose()
    finally:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_startpruefung_meldet_falsche_rollen(engines):
    from app.tenancy import konfiguration_pruefen
    app_db.set_engine(engines["app"], engines["plattform"])
    assert konfiguration_pruefen() == []
    # Plattform-Sitzungen über die Anwendungsrolle: der Worker sähe nichts.
    app_db.set_engine(engines["app"], engines["app"])
    assert any("DATABASE_URL_PLATTFORM" in h for h in konfiguration_pruefen())
    # Anwendung über eine Rolle mit BYPASSRLS: RLS wäre wirkungslos.
    app_db.set_engine(engines["plattform"], engines["plattform"])
    assert any("umgeht Row Level Security" in h for h in konfiguration_pruefen())
