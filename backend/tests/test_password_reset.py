"""Kennwort zuruecksetzen: ueber die Verwaltungs-CLI, wenn es niemand mehr weiss."""
import pytest

from app import cli
from app.models import RefreshToken, Role
from app.services import auth_service

from tests.conftest import auth_headers, make_user


def _login(client, email, password):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


class TestSetPassword:
    def test_neues_kennwort_gilt_altes_nicht_mehr(self, client, db):
        user = make_user(db, email="chef@example.com", role=Role.ADMIN.value)
        auth_service.set_password(db, user=user, password="ganz-neues-kennwort")
        db.commit()

        assert _login(client, "chef@example.com", "test-passwort-123").status_code == 401
        assert _login(client, "chef@example.com", "ganz-neues-kennwort").status_code == 200

    def test_zu_kurzes_kennwort_wird_abgelehnt(self, db):
        user = make_user(db, email="chef@example.com")
        with pytest.raises(auth_service.AuthError):
            auth_service.set_password(db, user=user, password="kurz")

    def test_angemeldete_geraete_verlieren_ihren_zugang(self, client, db):
        user = make_user(db, email="chef@example.com")
        auth_headers(client, email="chef@example.com")  # legt einen Refresh-Token an
        offene = [t for t in db.query(RefreshToken).filter_by(user_id=user.id)
                  if t.revoked_at is None]
        assert offene

        auth_service.set_password(db, user=user, password="ganz-neues-kennwort")
        db.commit()
        db.expire_all()

        assert all(t.revoked_at is not None
                   for t in db.query(RefreshToken).filter_by(user_id=user.id))


class TestCli:
    def test_list_users_zeigt_konten_ohne_kennwort(self, db, capsys):
        make_user(db, email="chef@example.com", role=Role.ADMIN.value)
        cli.list_users()
        ausgabe = capsys.readouterr().out
        assert "chef@example.com" in ausgabe
        assert "admin" in ausgabe
        assert "test-passwort-123" not in ausgabe
        assert "$" not in ausgabe  # kein Hash, auch kein Teil davon

    def test_reset_password_ueber_die_cli(self, client, db, monkeypatch):
        make_user(db, email="chef@example.com", role=Role.ADMIN.value)
        eingaben = iter(["zurueckgesetzt-123", "zurueckgesetzt-123"])
        monkeypatch.setattr(cli.getpass, "getpass", lambda *_: next(eingaben))

        cli.reset_password("Chef@Example.com")  # Grossschreibung egal

        assert _login(client, "chef@example.com", "zurueckgesetzt-123").status_code == 200

    def test_abweichende_wiederholung_aendert_nichts(self, client, db, monkeypatch):
        make_user(db, email="chef@example.com")
        eingaben = iter(["zurueckgesetzt-123", "vertippt-12345678"])
        monkeypatch.setattr(cli.getpass, "getpass", lambda *_: next(eingaben))

        with pytest.raises(SystemExit):
            cli.reset_password("chef@example.com")
        assert _login(client, "chef@example.com", "test-passwort-123").status_code == 200

    def test_unbekanntes_konto(self, db):
        with pytest.raises(SystemExit):
            cli.reset_password("gibt-es-nicht@example.com")
