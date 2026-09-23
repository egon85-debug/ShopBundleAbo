"""Verwaltungs-CLI.

    python -m app.cli create-admin   --email admin@example.com
    python -m app.cli list-users
    python -m app.cli reset-password --email admin@example.com

Im Container jeweils mit "docker compose exec api" davor.
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Role, User
from app.services import auth_service


def _kennwort_abfragen() -> str:
    """Zweimal abfragen: ein Vertipper beim Zuruecksetzen sperrt sonst gleich wieder aus."""
    erstes = getpass.getpass("Passwort (min. 10 Zeichen): ")
    zweites = getpass.getpass("Passwort wiederholen: ")
    if erstes != zweites:
        print("Fehler: Die beiden Eingaben stimmen nicht ueberein.", file=sys.stderr)
        sys.exit(1)
    return erstes


def create_admin(email: str, display_name: str, password: str | None) -> None:
    if not password:
        password = _kennwort_abfragen()
    db = get_sessionmaker()()
    try:
        user = auth_service.create_user(
            db, email=email, password=password,
            display_name=display_name, role=Role.ADMIN.value)
        db.commit()
        print(f"Admin angelegt: {user.email} ({user.id})")
    except auth_service.AuthError as exc:
        db.rollback()
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def list_users() -> None:
    """Anmeldenamen, Rolle und Zustand — nie Kennwoerter oder deren Pruefsummen."""
    db = get_sessionmaker()()
    try:
        users = db.scalars(select(User).order_by(User.created_at)).all()
        if not users:
            print("Noch keine Konten angelegt.")
            return
        breite = max(len(u.email) for u in users)
        for u in users:
            zustand = "aktiv" if u.is_active else "gesperrt"
            print(f"{u.email:<{breite}}  {u.role:<18}  {zustand:<8}  {u.display_name}")
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="winterfeld")
    sub = parser.add_subparsers(dest="command", required=True)

    admin_parser = sub.add_parser("create-admin", help="Ersten Admin-Benutzer anlegen")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--name", default="Administrator")
    admin_parser.add_argument("--password", default=None,
                              help="Unsicher auf Shell-History — besser interaktiv eingeben")

    sub.add_parser("list-users", help="Vorhandene Konten anzeigen (ohne Passwoerter)")

    reset_parser = sub.add_parser("reset-password", help="Passwort eines Kontos neu setzen")
    reset_parser.add_argument("--email", required=True)

    args = parser.parse_args()
    if args.command == "create-admin":
        create_admin(args.email, args.name, args.password)
    elif args.command == "list-users":
        list_users()
    elif args.command == "reset-password":
        reset_password(args.email)


if __name__ == "__main__":
    main()
