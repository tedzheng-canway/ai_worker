"""PyInstaller entry point for the desktop sidecar."""
import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()
    from coworker.server.run import main
    main()
