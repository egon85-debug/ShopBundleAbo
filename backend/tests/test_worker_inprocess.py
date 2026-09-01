"""Der Job-Worker muss auch im API-Prozess laufen können (kleine Installationen)."""
import threading
import time

from app.jobs.worker import Worker


def test_worker_laeuft_ausserhalb_des_hauptthreads():
    """Signalbehandlung geht nur im Hauptthread – im Thread darf sie nicht scheitern."""
    worker = Worker(worker_id="test")
    verarbeitet: list[bool] = []

    def keine_jobs() -> bool:
        verarbeitet.append(True)
        worker.stop()  # nach dem ersten Durchlauf beenden
        return False

    worker.process_one = keine_jobs  # type: ignore[method-assign]

    thread = threading.Thread(target=worker.run_forever, daemon=True)
    thread.start()
    thread.join(timeout=5)

    assert not thread.is_alive(), "Worker im Thread ist nicht sauber beendet"
    assert verarbeitet, "Worker hat keinen Durchlauf gemacht"


def test_stop_beendet_den_worker():
    worker = Worker(worker_id="test")
    worker.process_one = lambda: False  # type: ignore[method-assign]

    thread = threading.Thread(target=worker.run_forever, daemon=True)
    thread.start()
    time.sleep(0.1)
    assert thread.is_alive()

    worker.stop()
    thread.join(timeout=10)
    assert not thread.is_alive(), "stop() hat den Worker nicht beendet"
