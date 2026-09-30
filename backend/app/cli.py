"""Verwaltungs-CLI.

    python -m app.cli mandant-anlegen --name "Muster GmbH" --kurzname muster
    python -m app.cli create-admin   --email admin@example.com [--mandant muster]
    python -m app.cli list-users
    python -m app.cli reset-password --email admin@example.com
    python -m app.cli check-ai

Im Container jeweils mit "docker compose exec api" davor.
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Membership, Role, Tenant, User
from app.services import auth_service
from app.tenancy import mandant_setzen


def _mandant(db, angabe: str | None) -> Tenant:
    """Firma per Kurzname oder ID; ohne Angabe die einzige vorhandene."""
    if angabe:
        tenant = db.scalar(select(Tenant).where(
            (Tenant.kurzname == angabe) | (Tenant.id == angabe)))
        if tenant is None:
            print(f"Fehler: Keine Firma „{angabe}“. Vorhandene zeigt list-mandanten.",
                  file=sys.stderr)
            sys.exit(1)
        return tenant
    alle = db.scalars(select(Tenant).order_by(Tenant.kurzname)).all()
    if len(alle) == 1:
        return alle[0]
    if not alle:
        print("Fehler: Noch keine Firma angelegt. Zuerst: mandant-anlegen", file=sys.stderr)
    else:
        namen = ", ".join(t.kurzname for t in alle)
        print(f"Fehler: Mehrere Firmen vorhanden ({namen}). Bitte --mandant angeben.",
              file=sys.stderr)
    sys.exit(1)


def mandant_anlegen(name: str, kurzname: str, sku_praefix: str) -> None:
    import re
    kurzname = kurzname.strip().lower()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", kurzname):
        print("Fehler: Kurzname nur aus a–z, 0–9 und Bindestrich (wird Teil der Adresse).",
              file=sys.stderr)
        sys.exit(1)
    with get_sessionmaker()() as db:
        if db.scalar(select(Tenant).where(Tenant.kurzname == kurzname)):
            print(f"Fehler: Kurzname „{kurzname}“ ist vergeben.", file=sys.stderr)
            sys.exit(1)
        tenant = Tenant(name=name, kurzname=kurzname, sku_praefix=sku_praefix.upper())
        db.add(tenant)
        db.commit()
        print(f"Firma angelegt: {tenant.name} ({tenant.kurzname}, {tenant.id})")


def list_mandanten() -> None:
    with get_sessionmaker()() as db:
        for t in db.scalars(select(Tenant).order_by(Tenant.kurzname)):
            print(f"{t.kurzname:<24}  {t.status:<12}  {t.name}")


def _kennwort_abfragen() -> str:
    """Zweimal abfragen: ein Vertipper beim Zuruecksetzen sperrt sonst gleich wieder aus."""
    erstes = getpass.getpass("Passwort (min. 10 Zeichen): ")
    zweites = getpass.getpass("Passwort wiederholen: ")
    if erstes != zweites:
        print("Fehler: Die beiden Eingaben stimmen nicht ueberein.", file=sys.stderr)
        sys.exit(1)
    return erstes


def create_admin(email: str, display_name: str, password: str | None,
                 mandant: str | None = None) -> None:
    db = get_sessionmaker()()
    try:
        tenant = _mandant(db, mandant)
        mandant_setzen(db, tenant.id)
        if not password:
            password = _kennwort_abfragen()
        user = auth_service.create_user(
            db, email=email, password=password,
            display_name=display_name, role=Role.ADMIN.value)
        db.commit()
        print(f"Admin angelegt: {user.email} ({user.id}) für {tenant.name}")
    except auth_service.AuthError as exc:
        db.rollback()
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def list_users() -> None:
    """Anmeldenamen, Firma, Rolle und Zustand — nie Kennwoerter oder deren Pruefsummen."""
    db = get_sessionmaker()()
    try:
        zeilen = db.execute(
            select(User, Membership, Tenant)
            .join(Membership, Membership.user_id == User.id)
            .join(Tenant, Tenant.id == Membership.tenant_id)
            .order_by(Tenant.kurzname, User.email)).all()
        if not zeilen:
            print("Noch keine Konten angelegt.")
            return
        breite = max(len(u.email) for u, _, _ in zeilen)
        for u, m, t in zeilen:
            zustand = "aktiv" if u.is_active and m.is_active else "gesperrt"
            print(f"{t.kurzname:<16}  {u.email:<{breite}}  {m.role:<18}  {zustand:<8}  "
                  f"{u.display_name}")
    finally:
        db.close()


def reset_password(email: str) -> None:
    db = get_sessionmaker()()
    try:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            print(f"Fehler: Kein Konto mit {email}. Vorhandene Konten zeigt list-users.",
                  file=sys.stderr)
            sys.exit(1)
        password = _kennwort_abfragen()
        auth_service.set_password(db, user=user, password=password)
        db.commit()
        print(f"Passwort fuer {user.email} neu gesetzt. Angemeldete Geraete wurden abgemeldet.")
    except auth_service.AuthError as exc:
        db.rollback()
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def check_ai() -> None:
    """Prueft Schluessel, Modell und Bilderkennung mit einem erzeugten Testbild.

    Laeuft denselben Weg wie ein echtes Foto — Aufbereitung, Anfrage,
    Auswertung der Antwort — und sagt am Ende in einem Satz, ob es geht.
    """
    import io

    from PIL import Image, ImageDraw, ImageFont

    from app.providers.anthropic_provider import AnthropicVisionProvider
    from app.providers.base import ProviderUnavailable

    ean = "4006381333931"
    bild = Image.new("RGB", (900, 260), "white")
    zeichnen = ImageDraw.Draw(bild)
    schrift = ImageFont.load_default(size=56)
    zeichnen.text((40, 40), "Testartikel", fill="black", font=schrift)
    zeichnen.text((40, 140), f"EAN {ean}", fill="black", font=schrift)
    puffer = io.BytesIO()
    bild.save(puffer, format="JPEG")

    print("Sende Testbild an die Bilderkennung …")
    try:
        ergebnis = AnthropicVisionProvider().analyze_product_image(
            puffer.getvalue(), "image/jpeg")
    except ProviderUnavailable as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:  # Netz, Zeitueberschreitung, unerwartete Antwort
        print(f"Fehler: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)

    from app.config import get_settings
    modell = get_settings().anthropic_model
    if ergebnis.ean == ean:
        print(f"Bilderkennung funktioniert. Modell: {modell}. EAN richtig gelesen: {ean}")
    else:
        print(f"Verbindung steht (Modell: {modell}), aber die EAN wurde nicht richtig "
              f"gelesen: {ergebnis.ean!r} statt {ean!r}.")
        sys.exit(2)


def check_recherche(ean: str | None, suche: str | None) -> None:
    """Recherche einmal echt ausprobieren (kostet ein paar Cent Websuche)."""
    from app.providers.base import ProviderUnavailable
    from app.providers.registry import get_research
    recherche = get_research()
    print(f"Recherche ueber: {recherche.name}")
    try:
        treffer = recherche.identify_product(ean=ean, mpn=None, query=suche)
    except ProviderUnavailable as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"Fehler: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
    if not treffer:
        print("Nichts gefunden.")
        sys.exit(2)
    for t in treffer:
        print(f"\n{t.product_name}  (Sicherheit {t.match_score:.0%})")
        for feld in ("manufacturer", "ean", "mpn", "category"):
            if getattr(t, feld):
                print(f"  {feld}: {getattr(t, feld)}")
        for name, wert in list(t.technical_data.items())[:6]:
            print(f"  {name}: {wert}")
        if t.source_url:
            print(f"  Quelle: {t.source_url}")
    bester = max(treffer, key=lambda t: t.match_score)
    print("\nSuche Preise …")
    angebote = recherche.find_offers(ean=bester.ean or ean,
                                     query=bester.product_name or suche or "", condition="new")
    preise = sorted(a.price for a in angebote if a.is_same_variant)
    if preise:
        print(f"{len(angebote)} Angebote, vergleichbar {preise[0]} – {preise[-1]} EUR")
    else:
        print("Keine vergleichbaren Angebote gefunden.")


def shop_verbinden(url: str, name: str, mandant: str | None = None) -> None:
    """Verbindung zum eigenen Shop anlegen (oder neu verschluesseln) und die
    Werte ausgeben, die im Shop (Vercel) einzutragen sind.

    Beide Geheimnisse entstehen hier und stehen nur in diesem Terminal —
    nicht im Quellcode, nicht im Chat.
    """
    import json
    import secrets

    from app.config import get_settings
    from app.models import ShopConnection
    from app.utils.security import encrypt_credentials

    lager = get_settings().oeffentliche_basis()
    if not lager:
        print("Fehler: DOMAIN ist in der .env nicht gesetzt (z. B. lager.ihre-domain.de).",
              file=sys.stderr)
        sys.exit(1)
    url = url.strip().rstrip("/")
    if not url.startswith("https://"):
        print("Fehler: die Shop-Adresse muss mit https:// beginnen.", file=sys.stderr)
        sys.exit(1)

    api_key = secrets.token_hex(32)
    webhook_secret = secrets.token_hex(32)
    with get_sessionmaker()() as db:
        mandant_setzen(db, _mandant(db, mandant).id)
        verbindung = db.scalar(select(ShopConnection).where(
            ShopConnection.connector_type == "winterfeld"))
        neu = verbindung is None
        if neu:
            verbindung = ShopConnection(name=name, connector_type="winterfeld", base_url=url)
            db.add(verbindung)
        verbindung.base_url = url
        verbindung.is_active = True
        verbindung.webhook_secret = webhook_secret
        verbindung.credentials_encrypted = encrypt_credentials(json.dumps({"api_key": api_key}))
        db.commit()
        verbindung_id = verbindung.id

    webhook = f"{lager}/api/v1/shop/webhooks/{verbindung_id}/order"
    print(f"Shop-Verbindung {'angelegt' if neu else 'erneuert (neue Schluessel)'}: {url}\n")
    print("Jetzt in Vercel eintragen: Projekt → Settings → Environment Variables,")
    print("Umgebung \"Production\" (bestehende Werte ersetzen):\n")
    print(f"  INGEST_API_KEY        {api_key}")
    print(f"  LAGER_WEBHOOK_URL     {webhook}")
    print(f"  LAGER_WEBHOOK_SECRET  {webhook_secret}\n")
    print("Danach in Vercel neu veroeffentlichen: Deployments → neuestes → ⋯ → Redeploy.")
    print("Dann pruefen mit:  docker compose exec api python -m app.cli shop-testen")
    print("\nDiese Werte nirgends sonst hineinkopieren (auch nicht in einen Chat).")


def shop_testen(mandant: str | None = None) -> None:
    from app.connectors.registry import build_connector
    from app.models import ShopConnection
    with get_sessionmaker()() as db:
        mandant_setzen(db, _mandant(db, mandant).id)
        verbindungen = db.scalars(select(ShopConnection).where(
            ShopConnection.is_active.is_(True))).all()
        if not verbindungen:
            print("Keine aktive Shop-Verbindung. Zuerst: python -m app.cli shop-verbinden …")
            sys.exit(1)
        fehler = False
        for v in verbindungen:
            try:
                build_connector(v).test_connection()
                print(f"✓ {v.name} ({v.base_url}): Verbindung und Schluessel in Ordnung")
            except Exception as exc:
                fehler = True
                print(f"✗ {v.name} ({v.base_url}): {exc}")
    sys.exit(1 if fehler else 0)


def app_holen() -> None:
    """Neueste Android-App von GitHub holen und unter /app bereitstellen."""
    from app.services import app_download
    print("Lade die neueste App von GitHub …")
    try:
        info = app_download.holen()
    except Exception as exc:
        print(f"Fehler: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
    mb = info["size"] / 1_000_000
    print(f"App {info['version']} bereitgestellt ({mb:.1f} MB, Pruefsumme ok).")
    print("Auf dem Handy im Browser oeffnen: https://<Ihre Domain>/app")


def main() -> None:
    parser = argparse.ArgumentParser(prog="winterfeld")
    sub = parser.add_subparsers(dest="command", required=True)

    mandant_parser = sub.add_parser("mandant-anlegen", help="Neue Firma (Mandant) anlegen")
    mandant_parser.add_argument("--name", required=True)
    mandant_parser.add_argument("--kurzname", required=True, help="z. B. muster (Teil der Adresse)")
    mandant_parser.add_argument("--sku-praefix", default="ART")
    sub.add_parser("list-mandanten", help="Vorhandene Firmen anzeigen")

    admin_parser = sub.add_parser("create-admin", help="Ersten Admin-Benutzer anlegen")
    admin_parser.add_argument("--mandant", default=None, help="Kurzname der Firma")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--name", default="Administrator")
    admin_parser.add_argument("--password", default=None,
                              help="Unsicher auf Shell-History — besser interaktiv eingeben")

    sub.add_parser("list-users", help="Vorhandene Konten anzeigen (ohne Passwoerter)")

    reset_parser = sub.add_parser("reset-password", help="Passwort eines Kontos neu setzen")
    reset_parser.add_argument("--email", required=True)

    sub.add_parser("check-ai", help="KI-Schluessel und Bilderkennung pruefen")
    recherche_parser = sub.add_parser(
        "check-recherche", help="Produkt- und Preisrecherche einmal echt ausprobieren")
    recherche_parser.add_argument("--ean", default=None)
    recherche_parser.add_argument("--suche", default=None,
                                  help='z. B. "Makita DHP484Z"')
    shop_parser = sub.add_parser(
        "shop-verbinden", help="Verbindung zum eigenen Shop einrichten, Schluessel erzeugen")
    shop_parser.add_argument("--url", required=True,
                             help="z. B. https://winterfeld-logistik-shop.vercel.app")
    shop_parser.add_argument("--name", default="Winterfeldt Shop")
    shop_parser.add_argument("--mandant", default=None, help="Kurzname der Firma")
    shop_test_parser = sub.add_parser("shop-testen", help="Shop-Verbindungen pruefen")
    shop_test_parser.add_argument("--mandant", default=None, help="Kurzname der Firma")
    sub.add_parser("app-holen", help="Neueste Android-App von GitHub unter /app bereitstellen")

    args = parser.parse_args()
    if args.command == "mandant-anlegen":
        mandant_anlegen(args.name, args.kurzname, args.sku_praefix)
    elif args.command == "list-mandanten":
        list_mandanten()
    elif args.command == "create-admin":
        create_admin(args.email, args.name, args.password, args.mandant)
    elif args.command == "list-users":
        list_users()
    elif args.command == "reset-password":
        reset_password(args.email)
    elif args.command == "check-ai":
        check_ai()
    elif args.command == "check-recherche":
        if not (args.ean or args.suche):
            parser.error("--ean oder --suche angeben")
        check_recherche(args.ean, args.suche)
    elif args.command == "shop-verbinden":
        shop_verbinden(args.url, args.name, args.mandant)
    elif args.command == "shop-testen":
        shop_testen(args.mandant)
    elif args.command == "app-holen":
        app_holen()


if __name__ == "__main__":
    main()
