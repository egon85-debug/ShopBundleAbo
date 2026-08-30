"""Verwaltungs-CLI: python -m app.cli create-admin --email admin@example.com"""
import argparse
import getpass
import sys

from app.db import get_sessionmaker
from app.models import Role
from app.services import auth_service


def create_admin(email: str, display_name: str, password: str | None) -> None:
    if not password:
        password = getpass.getpass("Passwort (min. 10 Zeichen): ")
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="winterfeld")
    sub = parser.add_subparsers(dest="command", required=True)
    admin_parser = sub.add_parser("create-admin", help="Ersten Admin-Benutzer anlegen")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--name", default="Administrator")
    admin_parser.add_argument("--password", default=None,
                              help="Unsicher auf Shell-History — besser interaktiv eingeben")
    args = parser.parse_args()
    if args.command == "create-admin":
        create_admin(args.email, args.name, args.password)


if __name__ == "__main__":
    main()
