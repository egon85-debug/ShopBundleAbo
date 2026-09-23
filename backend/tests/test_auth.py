"""API-Tests: Login, Token-Refresh (Rotation), Rollenrechte."""
from tests.conftest import auth_headers, make_user


class TestLogin:
    def test_login_success(self, client, employee):
        response = client.post("/api/v1/auth/login", json={
            "email": "worker@example.com", "password": "test-passwort-123"})
        assert response.status_code == 200
        body = response.json()
        assert body["access_token"] and body["refresh_token"]

    def test_login_wrong_password(self, client, employee):
        response = client.post("/api/v1/auth/login", json={
            "email": "worker@example.com", "password": "falsch-falsch-falsch"})
        assert response.status_code == 401

    def test_me(self, client, employee):
        headers = auth_headers(client)
        response = client.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["role"] == "employee"

    def test_unauthenticated(self, client, engine):
        assert client.get("/api/v1/auth/me").status_code == 401


class TestRefreshRotation:
    def test_refresh_rotates_and_blocks_reuse(self, client, employee):
        login = client.post("/api/v1/auth/login", json={
            "email": "worker@example.com", "password": "test-passwort-123"}).json()
        first = client.post("/api/v1/auth/refresh",
                            json={"refresh_token": login["refresh_token"]})
        assert first.status_code == 200
        # Wiederverwendung des alten Tokens muss abgelehnt werden.
        reuse = client.post("/api/v1/auth/refresh",
                            json={"refresh_token": login["refresh_token"]})
        assert reuse.status_code == 401


class TestRoles:
    def test_employee_cannot_manage_users(self, client, employee):
        headers = auth_headers(client)
        assert client.get("/api/v1/users", headers=headers).status_code == 403

    def test_admin_can_manage_users(self, client, db, admin):
        headers = auth_headers(client, email="admin@example.com")
        assert client.get("/api/v1/users", headers=headers).status_code == 200
        created = client.post("/api/v1/users", headers=headers, json={
            "email": "neu@example.com", "password": "sicheres-passwort",
            "display_name": "Neu", "role": "warehouse_manager"})
        assert created.status_code == 201

    def test_employee_cannot_create_stock_movement(self, client, db, employee):
        headers = auth_headers(client)
        capture = client.post("/api/v1/captures", headers=headers,
                              json={"client_capture_id": "cap-role-test-001"}).json()
        response = client.post(
            f"/api/v1/products/{capture['id']}/stock-movements", headers=headers,
            json={"movement_type": "manual_correction", "quantity_change": 5})
        assert response.status_code == 403


def test_app_absturzbericht_landet_im_audit_log(client, db, employee, caplog):
    from app.models import AuditLog
    from tests.conftest import auth_headers
    headers = auth_headers(client)
    bericht = "java.lang.IllegalStateException: kaputt\n\tat de.winterfeld.logistik.X.y(X.kt:1)"
    with caplog.at_level("ERROR", logger="winterfeld.app"):
        res = client.post("/api/v1/client-errors", headers=headers, json={
            "kind": "crash", "app_version": "1.0.46 (abc)", "device": "Pixel 8, Android 15",
            "report": bericht})
    assert res.status_code == 204, res.text
    assert "IllegalStateException" in caplog.text
    eintrag = db.query(AuditLog).filter(AuditLog.action == "client_crash").one()
    assert "X.kt:1" in eintrag.reason
    # ohne Anmeldung nicht
    assert client.post("/api/v1/client-errors", json={"report": "x"}).status_code == 401
